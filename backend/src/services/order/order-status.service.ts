import prisma from "../../config/prisma.ts"
import { OrderStatus } from "@prisma/client";
import { OrderEventBus } from "../../events/order.events.ts";
import { InventoryReleaseService } from "./inventoryRelease.service.ts";

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
    static async transition(
        orderUuid: string, 
        to: OrderStatus,
        context?: {
            changedBy?: string;
            reason?: string;
            notes?: string;
          }
        ) {
        const order= await prisma.order.findUnique({
            where: { uuid: orderUuid},
        });
        if (!order) {
            throw new Error("Order not found");
        };

        if (!ORDER_TRANSITIONS[order.status].includes(to)) {
            throw new Error( `Invalid transition: ${order.status} → ${to}` );
        };

        const previousStatus = order.status;
        const transitionedAt = new Date();

        const duration = order.updatedAt
            ? Math.floor((transitionedAt.getTime() - order.updatedAt.getTime()) / 1000)
            : null;

        const updated= await prisma.$transaction(async (tx) => {
            const updated= await prisma.order.update({
                where: {uuid: orderUuid},
                data:{ 
                    status: to,
                    ...(to === "READY" && { actualReadyAt: transitionedAt }),
                    ...(to === "COMPLETED" && { deliveredAt: transitionedAt }),
                    ...(to === "CANCELLED" && {
                        cancelledAt: transitionedAt,
                        cancelledBy: context?.changedBy,
                        cancellationReason: context?.reason,
                    }),  
                }
            });

            await tx.orderStatusHistory.create({
                data: {
                  tenantUuid: order.tenantUuid,
                  orderUuid: order.uuid,
                  fromStatus: previousStatus,
                  toStatus: to,
                  changedBy: context?.changedBy,
                  reason: context?.reason,
                  notes: context?.notes,
                  duration,
                },
            });
            return updated;
        })
        
        OrderEventBus.emit("ORDER_STATUS_CHANGED", {
            orderUuid,
            tenantUuid: order.tenantUuid,
            storeUuid: order.storeUuid,
            from: previousStatus,
            to,
            timestamp: transitionedAt,
        });

        await this.handleStatusChangeEffects(order, to);
        return updated;
    }

    private static async handleStatusChangeEffects(
        order: Order,
        newStatus: OrderStatus
      ) {
        switch (newStatus) {
          case "CANCELLED":
            await InventoryReleaseService.release(order.uuid);
            if (order.paymentStatus === "CAPTURED") {
              OrderEventBus.emit("ORDER_CANCELLED_AFTER_PAYMENT", {
                orderUuid: order.uuid,
              });
            }
            break;
    
          case "PAYMENT_FAILED":
            await InventoryReleaseService.release(order.uuid);
            break;
    
          case "PREPARING":
            OrderEventBus.emit("ORDER_READY_FOR_KITCHEN", {
              orderUuid: order.uuid,
              storeUuid: order.storeUuid,
            });
            break;
    
          case "READY":
            OrderEventBus.emit("ORDER_READY_FOR_PICKUP", {
              orderUuid: order.uuid,
              customerPhone: order.customerPhone,
            });
            break;
        }
    }
};


  