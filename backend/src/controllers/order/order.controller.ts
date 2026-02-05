import { Request, Response } from "express";
import { z } from "zod";
import prisma from "../../config/prisma.ts"
import { IdempotencyService } from "../../services/order/idempotency.service.ts";
import { OrderCommandService } from "../../services/order/order-command.service.ts";
import { OrderStatusService } from "../../services/order/order-status.service.ts";
import { createOrderSchema } from "../../validators/order.validator.ts";

const createOrderSchema= z.object({
    storeUuid: z.string().uuid(),
    orderType: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY", "CURBSIDE"]).default("DINE_IN"),
    tableNumber: z.string().optional(),
    deliveryAddress: z.any().optional(),
    customerNotes: z.string().optional(),
    promoCode: z.string().optional(),
    items: z.array(
        z.object({
        productUuid: z.string().uuid(),
        quantity: z.number().int().positive(),
        specialInstructions: z.string().optional(),
        modifiers: z.array(
            z.object({
            optionUuid: z.string().uuid(),
            quantity: z.number().int().positive().optional(),
            })
        ).optional(),
    })
    ).min(1),
});

export const createOrder= async (req: Request, res: Response)=>{
    try {
        const user= req.user;
        if (!user) {
            return res.status(401).json({ message: "Unauthorized" });
        };

        const tenantUuid = user.tenantUuid;
        if (!tenantUuid) {
            return res.status(400).json({ message: "Tenant context required" });
        };

        if (user.role !== "CUSTOMER") {
            return res.status(403).json({ message: "Only customers can place orders" });
        };

        const idempotencyKey = req.headers["idempotency-key"] as string;
        if (!idempotencyKey) {
            return res.status(400).json({ message: "Idempotency-Key required" });
        };

        const existing= await IdempotencyService.check(
            tenantUuid,
            idempotencyKey,
            "POST /orders"
        );
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

        const tenantUser = await prisma.tenantUser.findFirst({
            where: {
              tenantUuid,
              userUuid: user.uuid,
            },
        });
      
        if (!tenantUser) {
            return res.status(404).json({
              message: "User not found in this tenant",
            });
        }
       
        const order = await OrderCommandService.createOrder({
            tenantUuid,
            storeUuid: parsed.data.storeUuid,
            tenantUserUuid: tenantUser.uuid,
            orderType: parsed.data.orderType,
            tableNumber: parsed.data.tableNumber,
            deliveryAddress: parsed.data.deliveryAddress,
            customerNotes: parsed.data.customerNotes,
            promoCode: parsed.data.promoCode,
            items: parsed.data.items,
            idempotencyKey,
        });

        const response = {
            orderUuid: order.uuid,
            orderNumber: order.orderNumber,
            status: order.status,
            paymentStatus: order.paymentStatus,
            totalAmount: order.totalAmount,
            currency: order.currency,
            createdAt: order.createdAt,
        };
        return res.status(201).json(response);
    } catch (error: any) {
        console.error("[CREATE_ORDER_ERROR]", error);
        // Handle specific errors
        if (error.message === "Store is currently closed") {
            return res.status(400).json({ message: error.message });
        }
        if (error.message.includes("Insufficient stock")) {
            return res.status(400).json({ message: error.message });
        }
        if (error.message.includes("not found")) {
            return res.status(404).json({ message: error.message });
        }
        return res.status(500).json({
            message: "Failed to create order",
            error: process.env.NODE_ENV === "development" ? error.message : undefined,
        });
    }
};

export const getOrder= async (req: Request, res: Response)=>{
    try {
        const { orderUuid } = req.params;
        const user = req.user;

        const order = await prisma.order.findUnique({
            where: { uuid: orderUuid },
            include: {
                items: {
                    include: {
                    product: {
                        select: {
                        uuid: true,
                        name: true,
                        imageUrl: true,
                        },
                    },
                },
            },
            payment: true,
            refunds: true,
            statusHistory: {
                orderBy: { createdAt: "desc" },
            },
            },
        });  
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        };
        if (order.tenantUserUuid !== user.tenantUserUuid) {
            return res.status(403).json({ message: "Access denied" });
        }
      
        return res.status(200).json(order);
    } catch (error: any) {
        console.error("[GET_ORDER_ERROR]", error);
        return res.status(500).json({ message: "Failed to fetch order" });
    }
};

export const cancelOrder = async (req: Request, res: Response) => {
    try {
        const { orderUuid } = req.params;
        const { reason } = req.body;
        const user = req.user;
    
        const order = await prisma.order.findUnique({
            where: { uuid: orderUuid },
        });
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        };
        if (order.tenantUserUuid !== user.tenantUserUuid) {
            return res.status(403).json({ message: "Access denied" });
        };

        const cancellableStatuses = ["PENDING", "PAYMENT_PENDING", "PAID"];
        if (!cancellableStatuses.includes(order.status)) {
            return res.status(400).json({
            message: `Cannot cancel order in status ${order.status}`,
            });
        };

        await OrderStatusService.transition(orderUuid, "CANCELLED", {
            changedBy: user.uuid,
            reason: reason || "Cancelled by customer",
        });
    
        return res.status(200).json({
            message: "Order cancelled successfully",
        });
    } catch (error) {
        console.error("[CANCEL_ORDER_ERROR]", error);
        return res.status(500).json({ message: "Failed to cancel order" });
    }
};

export const listOrders= async (req: Request, res: Response)=>{
    try {
        const user= req.user;
        const { status, limit = 20, offset = 0 } = req.query;

        const where: any = {
            tenantUserUuid: user.tenantUserUuid,
        };

        if (status) {
            where.status = status;
        };

        const [orders, total]= await Promise.all([
            prisma.order.findMany({
                where,
                include:{
                    items: {
                        select: {
                          productName: true,
                          quantity: true,
                          finalPrice: true,
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
                take: Number(limit),
                skip: Number(offset),  
            }),
            prisma.order.count({ where }),
        ]);

        return res.status(200).json({
            orders,
            pagination: {
              total,
              limit: Number(limit),
              offset: Number(offset),
            },
        });
    } catch (error) {
        console.error("[LIST_ORDERS_ERROR]", error);
        return res.status(500).json({ message: "Failed to fetch orders" });
    }
}


