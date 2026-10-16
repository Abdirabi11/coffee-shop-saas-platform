import type { OrderStatus } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { InventoryOrderService } from "../../services/inventory/InventoryOrder.service.ts";

const PAID_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>(["PAID", "PREPARING", "READY", "COMPLETED"]);


export class ReservationExpiryJob {
  static cronSchedule = "*/5 * * * *";
 
    static async run() {
        logWithContext("info", "[ReservationExpiry] Starting");
 
        try {
            // Find distinct orders with expired active reservations
            const expired = await prisma.inventoryReservation.findMany({
                where: {
                    status: "ACTIVE",
                    expiresAt: { lt: new Date() },
                },
                select: { orderUuid: true },
                distinct: ["orderUuid"],
            });
        
            if (expired.length === 0) {
                logWithContext("info", "[ReservationExpiry] No expired reservations");
                return { released: 0, committed: 0, failed: 0 };
            }
 
            let released = 0;
            let committed = 0;
            let failed = 0;

            // A paid order's reservation is still ACTIVE only if its commit
            // never ran (PAYMENT_CONFIRMED handler failed or the process died
            // after the payment committed). Releasing it would put sold stock
            // back on sale, so commit it instead.
            const orders = await prisma.order.findMany({
                where: { uuid: { in: expired.map((e) => e.orderUuid) } },
                select: { uuid: true, status: true },
            });
            const statusOf = new Map(orders.map((o) => [o.uuid, o.status]));

            for (const { orderUuid } of expired) {
                try {
                    if (PAID_STATUSES.has(statusOf.get(orderUuid) as OrderStatus)) {
                        await InventoryOrderService.commitForOrder({ orderUuid });
                        committed++;
                        continue;
                    }
                    await InventoryOrderService.releaseForOrder({ orderUuid });
                    released++;
                } catch (error: any) {
                    failed++;
                    logWithContext("error", "[ReservationExpiry] Release failed", {
                        orderUuid,
                        error: error.message,
                    });
                }
            }
 
            logWithContext("info", "[ReservationExpiry] Completed", {
                expired: expired.length,
                released,
                committed,
                failed,
            });
 
            MetricsService.increment("inventory.reservations.expired", released);
            return { released, committed, failed };
        } catch (error: any) {
            logWithContext("error", "[ReservationExpiry] Fatal error", {
                error: error.message,
            });
            throw error;
        }
    }
}