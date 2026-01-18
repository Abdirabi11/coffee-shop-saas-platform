import prisma from "../../config/prisma.ts"
import { OrderStatus } from "@prisma/client";
import { OrderEventBus } from "../../events/order.events.ts";

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    PENDING: ["PAYMENT_PENDING", "CANCELLED"],
    PAYMENT_PENDING: ["PAID", "PAYMENT_FAILED"],
    PAID: ["PREPARING"],
    PREPARING: ["READY"],
    READY: ["COMPLETED"],
    PAYMENT_FAILED: [],
    CANCELLED: [],
    COMPLETED: [],
};

export class OrderStatusService{
    static async transition(orderUuid: string, to: OrderStatus) {
        const order= await prisma.order.findUnique({
            where: { uuid: orderUuid},
        });
        if (!order) {
            throw new Error("Order not found");
        };

        if (!ORDER_TRANSITIONS[order.status].includes(to)) {
            throw new Error( `Invalid transition: ${order.status} → ${to}` );
        };

        const updated= await prisma.order.update({
            where: {uuid: orderUuid},
            data: { status: to}
        });

        OrderEventBus.emit("ORDER_STATUS_CHANGED", {
            orderUuid,
            from: order.status,
            to,
            storeUuid: order.storeUuid,
        });

        return updated;
    }
};


  