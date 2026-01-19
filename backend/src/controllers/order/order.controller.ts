import { Request, Response } from "express";
import { IdempotencyService } from "../../services/order/idempotency.service.ts";
import { OrderCommandService } from "../../services/order/order-command.service.ts";
import { createOrderSchema } from "../../validators/order.validator.ts";

export const createOrder= async (req: Request, res: Response)=>{
    try {
        const user= req.user;
        if (!user) {
            return res.status(401).json({ message: "Unauthorized" });
        };

        if (user.role !== "CUSTOMER") {
            return res.status(403).json({ message: "Only customers can place orders" });
        };

        const idempotencyKey = req.headers["idempotency-key"] as string;
        if (!idempotencyKey) {
            return res.status(400).json({ message: "Idempotency-Key required" });
        };

        const existing= await IdempotencyService.check(idempotencyKey);
        if (existing) {
            return res.status(200).json({ orderUuid: existing.orderUuid });
        };

        const parsed= createOrderSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                message: "Invalid request body",
                errors: parsed.error.format(),
            });
        };
       
        const order = await OrderCommandService.createOrder({
            storeUuid: parsed.data.storeUuid,
            items: parsed.data.items,
            experiment: parsed.data.experiment,
            user: {
                uuid: user.uuid,
                tier: user.tier,
            },
        });

        await IdempotencyService.store(idempotencyKey, order.uuid);

        return res.status(201).json({
            orderUuid: order.uuid,
            status: order.status,
            totalAmount: order.totalAmount,
        });
    } catch (error) {
        console.error("[CREATE_ORDER]", error);

        return res.status(500).json({
        message: "Failed to create order",
        });
    }
};
