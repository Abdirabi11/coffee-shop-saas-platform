import { Request, Response } from "express";
import { OrderStatusService } from "../../services/order/orderStatus.service.ts";


export class OrderWebhookController{
    static async handlePayment(req: Request, res: Response){
        try {
            const { orderUuid, status, provider } = req.body;
            
            // Verify webhook signature (implement based on provider)
            const isValid = await this.verifySignature(req);
            if (!isValid) return res.status(401).json({ error: "Invalid signature" });

            if (status === "paid") {
                // Payment confirmed
                await OrderStatusService.transition(orderUuid, "PAID", {
                    changedBy: "SYSTEM",
                    reason: `Payment confirmed by ${provider}`,
                });
            } else if (status === "failed") {
                // Payment failed
                await OrderStatusService.transition(orderUuid, "PAYMENT_FAILED", {
                    changedBy: "SYSTEM",
                    reason: `Payment failed via ${provider}`,
                });
            };

            return res.status(200).json({ received: true });
        } catch (error: any) {
            console.error("[Webhook] Payment webhook failed:", error);
            return res.status(500).json({ error: "Webhook processing failed" });
        }
    }
}