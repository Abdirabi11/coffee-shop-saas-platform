import { Request, Response } from "express";
import { PaymentService } from "../../services/payment/payment.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

export class PaymentController {
    // POST /api/v1/payments/start
    static async startPayment(req: Request, res: Response) {
        try {
            const staff = (req as any).user;
            if (!staff) {
                return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
            };

            const { orderUuid, provider } = req.body;

            if (!orderUuid || !provider) {
                return res.status(400).json({
                success: false,
                error: "orderUuid and provider are required",
                });
            };

            const result = await PaymentService.startPayment({
                orderUuid,
                provider,
                tenantUserUuid: staff.tenantUserUuid || staff.uuid,
            });

            return res.status(201).json({ success: true, data: result });
        } catch (error: any) {
            logWithContext("error", "[PaymentController] startPayment failed", {
                error: error.message,
            });
        
            const status = error.message.includes("NOT_FOUND") ? 404
                : error.message.includes("LOCKED") || error.message.includes("REVIEW") ? 403
                : error.message.includes("LIMIT") ? 429
                : 400;
        
            return res.status(status).json({ success: false, error: error.message });
        }
    }
    
    // POST /api/v1/payments/:paymentUuid/retry
    static async retryPayment(req: Request, res: Response) {
        try {
            const { paymentUuid } = req.params;
        
            if (!paymentUuid) {
                return res.status(400).json({ success: false, error: "paymentUuid required" });
            }
        
            const result = await PaymentService.retryFailedPayment(paymentUuid);
        
            return res.status(200).json({ success: true, data: { uuid: result.uuid, status: result.status } });
        } catch (error: any) {
            logWithContext("error", "[PaymentController] retryPayment failed", {
                error: error.message,
            });
        
            const status = error.message.includes("NOT_FOUND") ? 404
                : error.message.includes("MAX_RETRIES") ? 409
                : 400;
        
            return res.status(status).json({ success: false, error: error.message });
        }
    }
    
    // GET /api/v1/payments/:paymentUuid/status
    static async getStatus(req: Request, res: Response) {
        try {
            const { paymentUuid } = req.params;
        
            // For provider payments, poll the provider for latest status
            const result = await PaymentService.confirmByPolling(paymentUuid);
        
            return res.status(200).json({
                success: true,
                data: { uuid: result.uuid, status: result.status },
            });
        } catch (error: any) {
            logWithContext("error", "[PaymentController] getStatus failed", {
                error: error.message,
            });
            return res.status(error.message.includes("NOT_FOUND") ? 404 : 500).json({
                success: false,
                error: error.message,
            });
        }
    }
}