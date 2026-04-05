import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { InventoryOrderService } from "../../services/inventory/InventoryOrder.service.ts";


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
                return { released: 0, failed: 0 };
            }
 
            let released = 0;
            let failed = 0;
 
            for (const { orderUuid } of expired) {
                try {
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
                failed,
            });
 
            MetricsService.increment("inventory.reservations.expired", released);
            return { released, failed };
        } catch (error: any) {
            logWithContext("error", "[ReservationExpiry] Fatal error", {
                error: error.message,
            });
            throw error;
        }
    }
}