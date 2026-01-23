import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import prisma from "../config/prisma.ts"

export const verifyPaymentWebhook= async(
    req: Request,
    res: Response,
    next: NextFunction
)=>{
    try {
        const provider= req.headers["x-provider"] as string;
        const signature = req.headers["x-signature"] as string;

        if (!provider || !signature) {
          return res.status(400).json({ message: "Missing webhook headers" });
        };

        const payload = req.body;
        if (!Buffer.isBuffer(payload)) {
            return res.status(400).json({ message: "Invalid webhook payload" });
        };

        const parsed = JSON.parse(payload.toString());
        const orderUuid = parsed?.orderUuid;

        if (!orderUuid) {
            return res.status(400).json({ message: "orderUuid missing" });
        };

        const order= await prisma.order.findUnique({
            where: {uuid: orderUuid},
            select: {storeUuid: true}
        });

        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        };

        const webhookSecret = await prisma.webhookSecret.findUnique({
            where: {
              storeUuid_provider: {
                storeUuid: order.storeUuid,
                provider,
              },
            },
        });

        if (!webhookSecret) {
            return res.status(403).json({ message: "Webhook not registered" });
        };

        const expectedSignature= crypto 
          .createHmac("sha256", webhookSecret.secret)
          .update(payload)
          .digest("hex")
        
        if (
            !crypto.timingSafeEqual(
              Buffer.from(expectedSignature),
              Buffer.from(signature)
            )
        ) {
            return res.status(401).json({ message: "Invalid webhook signature" });
        }

        (req as any).webhook = {
            provider,
            storeUuid: order.storeUuid,
        };
  
        next();
    } catch (err) {
        console.error("[WEBHOOK_VERIFY_FAILED]", err);
        return res.status(401).json({ message: "Webhook verification failed" });
    }
};

