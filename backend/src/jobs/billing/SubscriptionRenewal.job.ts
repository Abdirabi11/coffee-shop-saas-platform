import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { SubscriptionService } from "../../services/billing/Subscription.service.ts";

export class SubscriptionRenewalJob{
    /**
   * Renew subscriptions ending today
   * Run daily at 1:00 AM
   */
    static async run() {
        const startTime = Date.now();
        
        logWithContext("info", "[SubscriptionRenewal] Starting renewal job");

        try {
            const today = dayjs().startOf("day").toDate();
            const tomorrow = dayjs().add(1, "day").startOf("day").toDate();

            // Find subscriptions ending today
            const subscriptions = await prisma.subscription.findMany({
                where: {
                currentPeriodEnd: {
                    gte: today,
                    lt: tomorrow,
                },
                status: "ACTIVE",
                cancelAtPeriodEnd: false,
                },
            });

            let renewed = 0;
            let failed = 0;

            for (const subscription of subscriptions) {
                try {
                    await SubscriptionService.renewSubscription(subscription.uuid);
                    renewed++;
                } catch (error: any) {
                    logWithContext("error", "[SubscriptionRenewal] Failed to renew", {
                        subscriptionUuid: subscription.uuid,
                        error: error.message,
                    });
                    failed++;
                }
            };

            const duration = Date.now() - startTime;

            logWithContext("info", "[SubscriptionRenewal] Job completed", {
                total: subscriptions.length,
                renewed,
                failed,
                durationMs: duration,
            });

        } catch (error: any) {
            logWithContext("error", "[SubscriptionRenewal] Job failed", {
                error: error.message,
            });
        }
    }
}