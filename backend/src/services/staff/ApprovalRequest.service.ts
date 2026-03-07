import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.jt";

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

    static async approveRequest(input: {
        requestUuid: string;
        approvedBy: string;
        notes?: string;
    }) {
        const request = await prisma.staffApprovalRequest.update({
            where: { uuid: input.requestUuid },
            data: {
                status: "APPROVED",
                approvedBy: input.approvedBy,
                approvalNotes: input.notes,
                respondedAt: new Date(),
            },
        });

        // Execute approval action
        await this.executeApproval(request);

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
        requestUuid: string;
        approvedBy: string;
        notes?: string;
    }) {
        const request = await prisma.staffApprovalRequest.update({
            where: { uuid: input.requestUuid },
            data: {
                status: "REJECTED",
                approvedBy: input.approvedBy,
                approvalNotes: input.notes,
                respondedAt: new Date(),
            },
        });

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

    private static async executeApproval(request: any) {
        const { approvalType, requestData } = request;

        switch (approvalType) {
            case "LATE_CLOCK_IN":
                await this.approveLateClockIn(requestData);
                break;

            case "MISSED_CLOCK_OUT":
                await this.approveMissedClockOut(requestData);
                break;

            case "CASH_VARIANCE":
                await this.approveCashVariance(requestData);
                break;

            case "REFUND":
                await this.approveRefund(requestData);
                break;

            case "VOID":
                await this.approveVoid(requestData);
                break;

            case "TEMP_PERMISSION":
                await this.approveTempPermission(requestData);
                break;

            default:
                logWithContext("warn", "[Approval] Unknown approval type", {
                type: approvalType,
                });
        }
    }

    private static async approveLateClockIn(data: any) {
        const { TimeEntryService } = require("./TimeEntry.service");
        await TimeEntryService.approveTimeEntry({
            timeEntryUuid: data.timeEntryUuid,
            approvedBy: data.approvedBy,
        });
    }

    private static async approveMissedClockOut(data: any) {
        // Create manual time entry or adjust existing one
        logWithContext("info", "[Approval] Missed clock-out approved", data);
    }

    private static async approveCashVariance(data: any) {
        const { CashDrawerService } = require("./CashDrawer.service");
        await CashDrawerService.approveCashVariance({
            drawerUuid: data.drawerUuid,
            approvedBy: data.approvedBy,
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

    private static async approveTempPermission(data: any) {
        const { PermissionManagementService } = require("./PermissionManagement.service");
        await PermissionManagementService.grantTemporaryPermission({
            userUuid: data.userUuid,
            storeUuid: data.storeUuid,
            permissionSlug: data.permissionSlug,
            validUntilMinutes: data.validUntilMinutes,
            grantedBy: data.approvedBy,
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