import prisma from "../../config/prisma.ts"
import { OrderStatus, type Order } from "@prisma/client";
import { InventoryOrderService } from "../inventory/InventoryOrder.service.ts";
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";


const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["PAID", "PAYMENT_FAILED", "CANCELLED"],
  PAID: ["PREPARING"],
  PREPARING: ["READY"],
  READY: ["COMPLETED"],
  // A failed payment attempt can still be followed by a successful retry
  PAYMENT_FAILED: ["PAID", "CANCELLED"],
  CANCELLED: [],
  COMPLETED: [],
};

export class OrderStatusService{
  static canTransition(from: OrderStatus, to: OrderStatus): boolean {
    return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
  }

  static async transition(
    orderUuid: string, 
    to: OrderStatus,
    context?: {
      changedBy?: string;
      reason?: string;
      notes?: string;
    }
  ){
    const order= await prisma.order.findUnique({
      where: { uuid: orderUuid},
    });
    if (!order) {
      throw new Error("Order not found");
    };

    if (!this.canTransition(order.status, to)) {
      throw new Error( `Invalid transition: ${order.status} → ${to}` );
    };

    const previousStatus = order.status;
    const transitionedAt = new Date();

    const duration = order.updatedAt
      ? Math.floor((transitionedAt.getTime() - order.updatedAt.getTime()) / 1000)
      : null;

    const updated= await prisma.$transaction(async (tx) => {
      const updated= await tx.order.update({
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
      
    EventBus.emit("ORDER_STATUS_CHANGED", {
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

  // Runs after the status change has committed, so a failing side effect
  // must not surface as a failed transition: log it instead of throwing.
  // Stock for CANCELLED is released by the ORDER_STATUS_CHANGED listener
  // (events/order.events.ts), so it isn't released again here.
  private static async handleStatusChangeEffects(
    order: Order,
    newStatus: OrderStatus
  ) {
    try {
      switch (newStatus) {
        case "CANCELLED":
          if (order.paymentStatus === "CAPTURED") {
            await EventBus.emit("ORDER_CANCELLED_AFTER_PAYMENT", {
              orderUuid: order.uuid,
              tenantUuid: order.tenantUuid,
            });
          }
          break;

        case "PAYMENT_FAILED":
          // Only releases ACTIVE reservations, so a repeat call is a no-op
          await InventoryOrderService.releaseForOrder({ orderUuid: order.uuid });
          break;

        case "PREPARING":
          await EventBus.emit("ORDER_READY_FOR_KITCHEN", {
            orderUuid: order.uuid,
            storeUuid: order.storeUuid,
          });
          break;

        case "READY":
          await EventBus.emit("ORDER_READY_FOR_PICKUP", {
            orderUuid: order.uuid,
            customerPhone: order.customerPhone,
          });
          break;
      }
    } catch (error: any) {
      logWithContext("error", "[OrderStatus] Status change side effect failed", {
        orderUuid: order.uuid,
        newStatus,
        error: error.message,
      });
    }
  }
};


  