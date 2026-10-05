import prisma from "../../config/prisma.ts"
import { OrderStatus, type Order } from "@prisma/client";
import { InventoryOrderService } from "../inventory/InventoryOrder.service.ts";
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";


const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["PAID", "PAYMENT_FAILED", "CANCELLED"],
  // Paid orders can be cancelled, but only through OrderCancellationService,
  // which requests the refund (see REFUND_ON_CANCEL)
  PAID: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["COMPLETED"],
  // A failed payment attempt can still be followed by a successful retry
  PAYMENT_FAILED: ["PAID", "CANCELLED"],
  CANCELLED: [],
  COMPLETED: [],
};

// Cancelling an order in one of these states means the customer has paid
export const REFUND_ON_CANCEL: ReadonlySet<OrderStatus> = new Set<OrderStatus>(["PAID", "PREPARING"]);

export class OrderStatusService{
  static canTransition(from: OrderStatus, to: OrderStatus): boolean {
    return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
  }

  // The status is read and changed under a row lock on the order, so two
  // concurrent writers (a status update, a cancellation, a payment
  // confirmation) serialize and each one re-checks the state machine against
  // the status the previous one committed.
  static async transition(
    orderUuid: string, 
    to: OrderStatus,
    context?: {
      changedBy?: string;
      reason?: string;
      notes?: string;
    }
  ){
    const transitionedAt = new Date();

    const { before, updated } = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "Order" WHERE "uuid" = ${orderUuid} FOR UPDATE`;

      const before = await tx.order.findUnique({
        where: { uuid: orderUuid },
      });
      if (!before) {
        throw new Error("Order not found");
      };

      if (!this.canTransition(before.status, to)) {
        throw new Error(`Invalid transition: ${before.status} → ${to}`);
      };

      // A paid order must not be cancelled without its refund
      if (to === "CANCELLED" && REFUND_ON_CANCEL.has(before.status)) {
        throw new Error(`CANNOT_CANCEL_PAID_ORDER_HERE: ${before.status} orders are cancelled via OrderCancellationService`);
      };

      const duration = Math.floor((transitionedAt.getTime() - before.updatedAt.getTime()) / 1000);

      const updated = await tx.order.update({
        where: { uuid: orderUuid },
        data: {
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
          tenantUuid: before.tenantUuid,
          orderUuid: before.uuid,
          fromStatus: before.status,
          toStatus: to,
          changedBy: context?.changedBy,
          reason: context?.reason,
          notes: context?.notes,
          duration,
        },
      });

      return { before, updated };
    });

    EventBus.emit("ORDER_STATUS_CHANGED", {
      orderUuid,
      tenantUuid: before.tenantUuid,
      storeUuid: before.storeUuid,
      from: before.status,
      to,
      timestamp: transitionedAt,
    });

    await this.handleStatusChangeEffects(before, to);
    return updated;
  }

  // Runs after the status change has committed, so a failing side effect
  // must not surface as a failed transition: log it instead of throwing.
  // Stock for CANCELLED is released by the ORDER_STATUS_CHANGED listener
  // (events/inventory.handlers.ts), so it isn't released again here.
  private static async handleStatusChangeEffects(
    order: Order,
    newStatus: OrderStatus
  ) {
    try {
      switch (newStatus) {
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


  