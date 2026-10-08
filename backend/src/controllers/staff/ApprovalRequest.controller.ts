import type { Request, Response } from "express";
import { ApprovalRequestService } from "../../services/staff/ApprovalRequest.service.ts";

// The route checks supervisor roles at the request's own store. Requests that
// move money or grant access need a manager there as well (the same roles as
// POST /cash-drawer/:drawerUuid/approve-variance).
const MANAGER_ROLES = new Set(["MANAGER", "STORE_MANAGER", "ADMIN", "TENANT_ADMIN", "OWNER", "SUPER_ADMIN"]);
const MANAGER_ONLY_TYPES = new Set(["CASH_VARIANCE", "TEMP_PERMISSION", "REFUND", "VOID"]);

const APPROVAL_ERRORS: Record<string, number> = {
    APPROVAL_NOT_FOUND: 404,
    APPROVAL_SELF: 403,
    APPROVAL_NOT_PENDING: 409,
    // From the approved action
    TIME_ENTRY_NOT_FOUND: 404,
    TIME_ENTRY_SELF_APPROVE: 403,
    DRAWER_NOT_FOUND: 404,
    VARIANCE_SELF_APPROVE: 403,
    DRAWER_NOT_RECONCILING: 409,
};

async function respond(req: Request, res: Response, action: "approve" | "reject") {
    try {
        const { requestUuid } = req.params;
        const { notes } = req.body ?? {};
        const tenantUuid = req.tenant!.uuid;

        const existing = await ApprovalRequestService.findRequest(tenantUuid, requestUuid);
        if (MANAGER_ONLY_TYPES.has(existing.approvalType)
            && !(req.access?.roles ?? []).some((r) => MANAGER_ROLES.has(r))) {
            return res.status(403).json({ error: "FORBIDDEN", message: "A manager must respond to this request" });
        }

        const input = { tenantUuid, requestUuid, approvedBy: req.user!.userUuid, notes };
        const request = action === "approve"
            ? await ApprovalRequestService.approveRequest(input)
            : await ApprovalRequestService.rejectRequest(input);

        return res.status(200).json({
            success: true,
            request,
        });

    } catch (error: any) {
        const status = APPROVAL_ERRORS[error.message];
        if (status) return res.status(status).json({ error: error.message });
        return res.status(500).json({
            error: "INTERNAL_SERVER_ERROR",
            message: error.message,
        });
    }
}

export class ApprovalRequestController {
  
    //GET /api/approvals/pending/:storeUuid
    static async getPendingRequests(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const { approvalType } = req.query;

            const requests = await ApprovalRequestService.getPendingRequests({
                storeUuid,
                approvalType: approvalType as string,
            });

            return res.status(200).json({
                success: true,
                requests,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/approvals/:requestUuid/approve
    static async approveRequest(req: Request, res: Response) {
        return respond(req, res, "approve");
    }

    //POST /api/approvals/:requestUuid/reject
    static async rejectRequest(req: Request, res: Response) {
        return respond(req, res, "reject");
    }

    //GET /api/approvals/history/:storeUuid
    static async getApprovalHistory(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const { dateFrom, dateTo, page, limit } = req.query;

            const result = await ApprovalRequestService.getApprovalHistory({
                storeUuid,
                dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
                dateTo: dateTo ? new Date(dateTo as string) : undefined,
                page: page ? parseInt(page as string) : undefined,
                limit: limit ? parseInt(limit as string) : undefined,
            });

            return res.status(200).json({
                success: true,
                ...result,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }
}