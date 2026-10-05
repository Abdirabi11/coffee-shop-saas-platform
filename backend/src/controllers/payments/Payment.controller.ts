import type { Request, Response } from "express";
import { PaymentService } from "../../services/payment/payment.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

export class PaymentController {
    // POST /api/v1/payments/start
    static async startPayment(req: Request, res: Response) {
        try {
            // Both set by requireTenantContext. tenantUserUuid must be the
            // real membership id: the JWT has no tenantUserUuid, and an
            // undefined value made the payment limits count every payment on
            // the platform.
            const tenantUuid = req.tenant?.uuid;
            const tenantUserUuid = req.tenantUser?.uuid;
            if (!tenantUuid || !tenantUserUuid) {
                return res.status(400).json({ success: false, error: "TENANT_CONTEXT_REQUIRED" });
            };

            const { orderUuid, provider } = req.body;

            if (!orderUuid || !provider) {
                return res.status(400).json({
                success: false,
                error: "orderUuid and provider are required",
                });
            };

            const result = await PaymentService.startPayment({
                tenantUuid,
                tenantUserUuid,
                orderUuid,
                provider,
            });

            return res.status(201).json({ success: true, data: result });
        } catch (error: any) {
            logWithContext("error", "[PaymentController] startPayment failed", {
                error: error.message,
            });
        
            const status = error.message.includes("NOT_FOUND") ? 404
                : error.message.includes("LOCKED") || error.message.includes("REVIEW") ? 403
                : error.message.includes("LIMIT") ? 429
                : error.message.includes("IN_PROGRESS") || error.message.includes("ALREADY_EXISTS") ? 409
                : 400;
        
            return res.status(status).json({ success: false, error: error.message });
        }
    }
    
    // POST /api/v1/payments/:paymentUuid/retry
    static async retryPayment(req: Request, res: Response) {
        try {
            const { paymentUuid } = req.params;
            const tenantUuid = req.tenant?.uuid;
        
            if (!paymentUuid) {
                return res.status(400).json({ success: false, error: "paymentUuid required" });
            }
            if (!tenantUuid) {
                return res.status(400).json({ success: false, error: "TENANT_CONTEXT_REQUIRED" });
            }
        
            const result = await PaymentService.retryFailedPayment(paymentUuid, tenantUuid);
        
            return res.status(200).json({ success: true, data: { uuid: result.uuid, status: result.status } });
        } catch (error: any) {
            logWithContext("error", "[PaymentController] retryPayment failed", {
                error: error.message,
            });
        
            const status = error.message.includes("NOT_FOUND") ? 404
                : error.message.includes("MAX_RETRIES") || error.message.includes("IN_PROGRESS") ? 409
                : 400;
        
            return res.status(status).json({ success: false, error: error.message });
        }
    }
    
    // GET /api/v1/payments/:paymentUuid/status
    static async getStatus(req: Request, res: Response) {
        try {
            const { paymentUuid } = req.params;
            const tenantUuid = req.tenant?.uuid;
            if (!tenantUuid) {
                return res.status(400).json({ success: false, error: "TENANT_CONTEXT_REQUIRED" });
            }
        
            // Tenant-scoped; polls the provider only for active payments, throttled
            const result = await PaymentService.getStatusForTenant({ paymentUuid, tenantUuid });
        
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