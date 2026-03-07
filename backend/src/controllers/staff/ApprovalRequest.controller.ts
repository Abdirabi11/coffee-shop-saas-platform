import { Request, Response } from "express";
import { ApprovalRequestService } from "../../services/staff/ApprovalRequest.service.ts";

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
        try {
            const { requestUuid } = req.params;
            const { notes } = req.body;

            const request = await ApprovalRequestService.approveRequest({
                requestUuid,
                approvedBy: req.user!.uuid,
                notes,
            });

            return res.status(200).json({
                success: true,
                request,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/approvals/:requestUuid/reject
    static async rejectRequest(req: Request, res: Response) {
        try {
            const { requestUuid } = req.params;
            const { notes } = req.body;

            const request = await ApprovalRequestService.rejectRequest({
                requestUuid,
                approvedBy: req.user!.uuid,
                notes,
            });

            return res.status(200).json({
                success: true,
                request,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
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