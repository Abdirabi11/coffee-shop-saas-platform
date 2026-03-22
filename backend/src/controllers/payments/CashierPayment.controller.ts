import { Request, Response } from "express";
import { CashierPaymentService } from "../../services/payment/cashier/payment.cashier.service.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { correctPaymentSchema, processPaymentSchema, voidPaymentSchema } from "../../validators/payment.validator.ts";

 
export class CashierPaymentController {
    // POST /api/v1/payments/cashier/process
    static async processPayment(req: Request, res: Response) {
        try {
            const staff = (req as any).user;
            if (!staff) {
                return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
            };
        
            if (!["CASHIER", "MANAGER", "ADMIN"].includes(staff.role)) {
                return res.status(403).json({ success: false, error: "FORBIDDEN" });
            };
        
            const tenantUuid = staff.tenantUuid;
            if (!tenantUuid) {
                return res.status(400).json({ success: false, error: "TENANT_CONTEXT_REQUIRED" });
            };
        
            const parsed = processPaymentSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({
                    success: false,
                    error: "VALIDATION_ERROR",
                    details: parsed.error.format(),
                });
            }
    
            const idempotencyKey = req.headers["idempotency-key"] as string;
            if (!idempotencyKey) {
                return res.status(400).json({ success: false, error: "IDEMPOTENCY_KEY_REQUIRED" });
            }
        
            const deviceId = (req.headers["x-device-id"] as string) || "unknown";
            const terminalId = parsed.data.terminalId || deviceId;
            const ipAddress = req.ip || req.socket.remoteAddress || "unknown";
        
            const payment = await CashierPaymentService.processPayment({
                tenantUuid,
                orderUuid: parsed.data.orderUuid,
                paymentMethod: parsed.data.paymentMethod,
                amount: parsed.data.amount ?? 0, // Service validates against order total
                amountTendered: parsed.data.amountTendered,
                changeGiven: parsed.data.changeGiven,
                processedBy: staff.uuid,
                deviceId,
                terminalId,
                ipAddress,
                receiptNumber: parsed.data.receiptNumber,
                notes: parsed.data.notes,
                idempotencyKey,
            });
        
            return res.status(201).json({
                success: true,
                data: {
                    uuid: payment.uuid,
                    orderUuid: payment.orderUuid,
                    amount: payment.amount,
                    currency: payment.currency,
                    paymentMethod: payment.paymentMethod,
                    status: payment.status,
                    processedAt: payment.processedAt,
                    receiptNumber: payment.receiptNumber,
                    changeGiven: payment.changeGiven,
                },
            });
        } catch (error: any) {
            logWithContext("error", "[CashierPaymentController] processPayment failed", {
                error: error.message,
            });
            return res.status(this.errorToStatus(error)).json({
                success: false,
                error: error.message,
            });
        }
    }
    
    // POST /api/v1/payments/cashier/:paymentUuid/void
    static async voidPayment(req: Request, res: Response) {
        try {
            const staff = (req as any).user;
            if (!staff) {
                return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
            }
        
            if (!["MANAGER", "ADMIN"].includes(staff.role)) {
                return res.status(403).json({ success: false, error: "MANAGER_REQUIRED" });
            }
        
            const { paymentUuid } = req.params;
        
            const parsed = voidPaymentSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({
                    success: false,
                    error: "VALIDATION_ERROR",
                    details: parsed.error.format(),
                });
            }
        
            const payment = await CashierPaymentService.voidPayment({
                paymentUuid,
                voidedBy: staff.uuid,
                voidReason: parsed.data.voidReason,
                managerPin: parsed.data.managerPin,
            });
        
            return res.status(200).json({
                success: true,
                data: {
                    uuid: payment.uuid,
                    status: payment.status,
                    voidedAt: payment.voidedAt,
                    voidReason: payment.voidReason,
                },
            });
        } catch (error: any) {
            logWithContext("error", "[CashierPaymentController] voidPayment failed", {
                error: error.message,
            });
            return res.status(this.errorToStatus(error)).json({
                success: false,
                error: error.message,
            });
        }
    }
    
    // POST /api/v1/payments/cashier/:paymentUuid/correct
    static async correctPayment(req: Request, res: Response) {
        try {
            const staff = (req as any).user;
            if (!staff) {
                return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
            }
        
            if (staff.role !== "ADMIN") {
                return res.status(403).json({ success: false, error: "ADMIN_REQUIRED" });
            }
        
            const { paymentUuid } = req.params;
        
            const parsed = correctPaymentSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({
                    success: false,
                    error: "VALIDATION_ERROR",
                    details: parsed.error.format(),
                });
            }
        
            const payment = await CashierPaymentService.correctPayment({
                paymentUuid,
                correctAmount: parsed.data.correctAmount,
                correctedBy: staff.uuid,
                correctionReason: parsed.data.correctionReason,
            });
    
            return res.status(200).json({
                success: true,
                data: {
                    uuid: payment.uuid,
                    originalAmount: payment.originalAmount,
                    amount: payment.amount,
                    correctedAt: payment.correctedAt,
                },
            });
        } catch (error: any) {
            logWithContext("error", "[CashierPaymentController] correctPayment failed", {
                error: error.message,
            });
            return res.status(this.errorToStatus(error)).json({
                success: false,
                error: error.message,
            });
        }
    }
    
    private static errorToStatus(error: any): number {
        const msg = error.message || "";
        if (msg.includes("NOT_FOUND")) return 404;
        if (msg.includes("ALREADY_EXISTS") || msg.includes("ALREADY_OPEN")) return 409;
        if (msg.includes("TOO_OLD") || msg.includes("INVALID") || msg.includes("MISMATCH")) return 400;
        if (msg.includes("FORBIDDEN") || msg.includes("LOCKED")) return 403;
        return 500;
    }
}