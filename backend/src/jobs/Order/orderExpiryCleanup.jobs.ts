import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { OrderCancellationService } from "../../services/order/orderCancellation.service.ts";

//Auto-cancel expired orders (payment timeout)
//Runs every 5 minutes
export class OrderExpiryCleanupJobs{
    static async run(){
        const startTime= Date.now();
        logWithContext("info", "[OrderExpiryCleanup] Starting job");

        try {
            const cancelled = await OrderCancellationService.cancelExpiredOrders();

            const duration = Date.now() - startTime;

            logWithContext("info", "[OrderExpiryCleanup] Job completed", {
                cancelled,
                durationMs: duration,
            });

            MetricsService.timing("order.expiry.cleanup.duration", duration);
            MetricsService.increment("order.expired.cancelled", cancelled);
        } catch (error:any) {
            logWithContext("error", "[OrderExpiryCleanup] Job failed", {
                error: error.message,
                stack: error.stack,
            });
        
            MetricsService.increment("order.expiry.cleanup.error", 1);
            throw error;
        }
    }
}