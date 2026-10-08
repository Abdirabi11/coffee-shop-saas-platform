import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";

export class ApprovalRequestService {

    static async createRequest(input: {
        tenantUuid: string;
        storeUuid: string;
        requestedBy: string;
        approvalType: string;
        requestData: any;
    }) {
        const request = await prisma.staffApprovalRequest.create({
            data: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                requestedBy: input.requestedBy,
                approvalType: input.approvalType as any,
                requestData: input.requestData,
                status: "PENDING",
            },
        });

        logWithContext("info", "[Approval] Request created", {
            requestUuid: request.uuid,
            type: input.approvalType,
            requestedBy: input.requestedBy,
        });

        MetricsService.increment("approval_request.created", 1, {
            type: input.approvalType,
        });

        // Emit event for real-time notification
        EventBus.emit("APPROVAL_REQUEST_CREATED", {
            requestUuid: request.uuid,
            storeUuid: input.storeUuid,
            type: input.approvalType,
        });

        return request;
    }

    // The request if it belongs to the tenant; throws APPROVAL_NOT_FOUND
    static async findRequest(tenantUuid: string, requestUuid: string) {
        const request = await prisma.staffApprovalRequest.findFirst({
            where: { uuid: requestUuid, tenantUuid },
        });
        if (!request) throw new Error("APPROVAL_NOT_FOUND");
        return request;
    }

    // Claim a PENDING request for this responder (one response per request;
    // nobody answers their own request)
    private static async claim(input: {
        tenantUuid: string;
        requestUuid: string;
        approvedBy: string;
        notes?: string;
        status: "APPROVED" | "REJECTED";
    }) {
        const request = await this.findRequest(input.tenantUuid, input.requestUuid);
        if (request.requestedBy === input.approvedBy) throw new Error("APPROVAL_SELF");

        const { count } = await prisma.staffApprovalRequest.updateMany({
            where: { uuid: input.requestUuid, tenantUuid: input.tenantUuid, status: "PENDING" },
            data: {
                status: input.status,
                approvedBy: input.approvedBy,
                approvalNotes: input.notes,
                respondedAt: new Date(),
            },
        });
        if (count === 0) throw new Error("APPROVAL_NOT_PENDING");

        return prisma.staffApprovalRequest.findUniqueOrThrow({ where: { uuid: input.requestUuid } });
    }

    static async approveRequest(input: {
        tenantUuid: string;
        requestUuid: string;
        approvedBy: string;
        notes?: string;
    }) {
        const request = await this.claim({ ...input, status: "APPROVED" });

        // Execute approval action; if it fails the request goes back to
        // PENDING so it can be retried
        try {
            await this.executeApproval(request, input.approvedBy);
        } catch (error) {
            await prisma.staffApprovalRequest.updateMany({
                where: { uuid: request.uuid, status: "APPROVED", approvedBy: input.approvedBy },
                data: { status: "PENDING", approvedBy: null, approvalNotes: null, respondedAt: null },
            });
            throw error;
        }

        logWithContext("info", "[Approval] Request approved", {
            requestUuid: input.requestUuid,
            type: request.approvalType,
            approvedBy: input.approvedBy,
        });

        MetricsService.increment("approval_request.approved", 1, {
            type: request.approvalType,
        });

        EventBus.emit("APPROVAL_REQUEST_APPROVED", {
            requestUuid: request.uuid,
            type: request.approvalType,
        });

        return request;
    }

    static async rejectRequest(input: {
        tenantUuid: string;
        requestUuid: string;
        approvedBy: string;
        notes?: string;
    }) {
        const request = await this.claim({ ...input, status: "REJECTED" });

        logWithContext("info", "[Approval] Request rejected", {
            requestUuid: input.requestUuid,
            type: request.approvalType,
            approvedBy: input.approvedBy,
        });

        MetricsService.increment("approval_request.rejected", 1, {
            type: request.approvalType,
        });

        return request;
    }

    // approvedBy is the responder, never a value from requestData (written
    // by the requester). Services are imported lazily: they import this one.
    private static async executeApproval(request: any, approvedBy: string) {
        const { approvalType, requestData, tenantUuid } = request;

        switch (approvalType) {
            case "LATE_CLOCK_IN":
                await this.approveLateClockIn(tenantUuid, requestData, approvedBy);
                break;

            case "MISSED_CLOCK_OUT":
                await this.approveMissedClockOut(requestData);
                break;

            case "CASH_VARIANCE":
                await this.approveCashVariance(tenantUuid, requestData, approvedBy);
                break;

            case "REFUND":
                await this.approveRefund(requestData);
                break;

            case "VOID":
                await this.approveVoid(requestData);
                break;

            case "TEMP_PERMISSION":
                await this.approveTempPermission(request, approvedBy);
                break;

            default:
                logWithContext("warn", "[Approval] Unknown approval type", {
                type: approvalType,
                });
        }
    }

    private static async approveLateClockIn(tenantUuid: string, data: any, approvedBy: string) {
        const { TimeEntryService } = await import("./TimeEntry.service.ts");
        await TimeEntryService.approveTimeEntry({
            tenantUuid,
            timeEntryUuid: data.timeEntryUuid,
            approvedBy,
        });
    }

    private static async approveMissedClockOut(data: any) {
        // Create manual time entry or adjust existing one
        logWithContext("info", "[Approval] Missed clock-out approved", data);
    }

    private static async approveCashVariance(tenantUuid: string, data: any, approvedBy: string) {
        const { CashDrawerService } = await import("./CashDrawer.service.ts");
        await CashDrawerService.approveCashVariance({
            tenantUuid,
            drawerUuid: data.drawerUuid,
            approvedBy,
        });
    }

    private static async approveRefund(data: any) {
        // Process refund
        logWithContext("info", "[Approval] Refund approved", data);
    }

    private static async approveVoid(data: any) {
        // Process void
        logWithContext("info", "[Approval] Void approved", data);
    }

    // Granted at the request's own store, never a store named in requestData
    private static async approveTempPermission(request: any, approvedBy: string) {
        const data = request.requestData;
        const { PermissionManagementService } = await import("./PermissionManagement.service.ts");
        await PermissionManagementService.grantTemporaryPermission({
            userUuid: request.requestedBy,
            storeUuid: request.storeUuid,
            permissionSlug: data.permissionSlug,
            validUntilMinutes: data.validUntilMinutes,
            grantedBy: approvedBy,
            reason: data.reason,
        });
    }

  
    static async getPendingRequests(input: {
        storeUuid: string;
        approvalType?: string;
    }) {
        const where: any = {
            storeUuid: input.storeUuid,
            status: "PENDING",
        };

        if (input.approvalType) {
            where.approvalType = input.approvalType;
        }

        return prisma.staffApprovalRequest.findMany({
            where,
            include: {
                requester: {
                select: {
                    uuid: true,
                    firstName: true,
                    lastName: true,
                },
                },
            },
            orderBy: { createdAt: "asc" },
        });
    }

    static async getApprovalHistory(input: {
        storeUuid: string;
        dateFrom?: Date;
        dateTo?: Date;
        page?: number;
        limit?: number;
    }) {
        const page = input.page || 1;
        const limit = input.limit || 50;
        const skip = (page - 1) * limit;

        const where: any = {
            storeUuid: input.storeUuid,
            status: { in: ["APPROVED", "REJECTED"] },
        };

        if (input.dateFrom || input.dateTo) {
            where.respondedAt = {};
            if (input.dateFrom) where.respondedAt.gte = input.dateFrom;
            if (input.dateTo) where.respondedAt.lte = input.dateTo;
        }

        const [requests, total] = await Promise.all([
            prisma.staffApprovalRequest.findMany({
                where,
                include: {
                    requester: {
                        select: {
                            uuid: true,
                            firstName: true,
                            lastName: true,
                        },
                    },
                    approver: {
                        select: {
                            uuid: true,
                            firstName: true,
                            lastName: true,
                        },
                    },
                },
                orderBy: { respondedAt: "desc" },
                skip,
                take: limit,
            }),
            prisma.staffApprovalRequest.count({ where }),
        ]);

        return {
            data: requests,
            meta: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    }
}