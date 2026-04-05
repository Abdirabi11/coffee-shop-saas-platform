import { Request, Response } from "express";
import { ReceiptService } from "../../services/payment/Receipt.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
 
export class ReceiptController {
    // GET /api/v1/receipts/order/:orderUuid
    // Get receipt for a specific order (customer-facing)
    static async getByOrder(req: Request, res: Response) {
        try {
            const { orderUuid } = req.params;
        
            const receipt = await ReceiptService.getByOrder(orderUuid);
        
            if (!receipt) {
                return res.status(404).json({
                    success: false,
                    error: "RECEIPT_NOT_FOUND",
                    message: "No receipt available for this order",
                });
            }
        
            return res.status(200).json({ success: true, data: receipt });
        } catch (error: any) {
            logWithContext("error", "[ReceiptCtrl] getByOrder failed", {
                error: error.message,
            });
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
    
    // GET /api/v1/receipts/payment/:paymentUuid
    // Get receipt by payment UUID (staff-facing)
    static async getByPayment(req: Request, res: Response) {
        try {
            const { paymentUuid } = req.params;
        
            const receipt = await ReceiptService.generate(paymentUuid);
        
            if (!receipt) {
                return res.status(404).json({
                    success: false,
                    error: "RECEIPT_NOT_FOUND",
                });
            }
        
            return res.status(200).json({ success: true, data: receipt });
        } catch (error: any) {
            logWithContext("error", "[ReceiptCtrl] getByPayment failed", {
                error: error.message,
            });
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
    
    // POST /api/v1/receipts/:paymentUuid/resend
    // Resend receipt email (staff can resend to customer)
    static async resend(req: Request, res: Response) {
        try {
            const { paymentUuid } = req.params;
            const { email } = req.body; // Optional override email
        
            const receipt = await ReceiptService.resend(paymentUuid, email);
        
            return res.status(200).json({
                success: true,
                message: "Receipt resent",
                data: {
                    receiptNumber: receipt.receiptNumber,
                    sentTo: email ?? receipt.customerEmail,
                },
            });
        } catch (error: any) {
            if (error.message === "RECEIPT_NOT_FOUND") {
                return res.status(404).json({ success: false, error: error.message });
            }
            if (error.message === "NO_EMAIL_ADDRESS") {
                return res.status(400).json({ success: false, error: error.message });
            }
            logWithContext("error", "[ReceiptCtrl] resend failed", {
                error: error.message,
            });
            return res.status(500).json({ success: false, error: "RESEND_FAILED" });
        }
    }
}