import { Request, Response } from "express";
import { IdempotencyService } from "../../services/order/idempotency.service.ts";
import { OrderCommandService } from "../../services/order/order-command.service.ts";
import { createOrderSchema } from "../../validators/order.validator.ts";

export class OrderController{
    static async createOrder(req: Request, res: Response){
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

        const parsed= createOrderSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
              message: "Invalid request body",
              errors: parsed.error.format(),
            });
        };

        const existing= await IdempotencyService.check(idempotencyKey);
        if (existing) {
            return res.status(200).json({ orderUuid: existing.orderUuid });
        };

        const order = await OrderCommandService.createOrder({
            user,
            payload: parsed.data,
        });

        await IdempotencyService.store(idempotencyKey, {
            orderUuid: order.uuid,
            status: order.status,
        });

        return res.status(201).json({
            orderUuid: order.uuid,
            status: order.status,
        });
    };
};
