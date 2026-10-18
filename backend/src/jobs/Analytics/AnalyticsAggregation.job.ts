import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { collectedPaymentsWhere, completedRefundsWhere } from "../../services/payment/DailyReconciliation.service.ts";
import { storeDaysDue, type StoreDay } from "./storeDays.ts";

// Runs hourly. Writes the money columns of StoreDailyMetrics for each store's
// previous local calendar day (see storeDaysDue), with the same rules as
// daily reconciliation, so the two agree:
//
//   revenueGross       payments collected that day (paidAt, or processedAt
//                      for cashier payments) in PAID / COMPLETED /
//                      PARTIALLY_REFUNDED / REFUNDED
//   revenueRefunded    refunds completed that day
//   revenueNet         gross - refunded - provider fees
//   revenueTax/Discount  tax and discount on the collected payments
//   paymentsSucceeded  collected payments; avgPaymentValue = gross / count
//   paymentsFailed     payments that failed that day
//
// The order and customer columns are DailyStoreMetricsJob's. Product metrics
// are ProductMetricsCalculationJob's.
export class AnalyticsAggregationJob {
    static cronSchedule = "20 * * * *";

    static async run(now: Date = new Date(), opts: { storeUuids?: string[]; localDate?: string } = {}) {
        const startTime = Date.now();
        const days = await storeDaysDue(now, opts);

        let computed = 0;
        let failed = 0;
        for (const day of days) {
            try {
                await this.aggregateStoreDay(day);
                computed++;
            } catch (error: any) {
                failed++;
                logWithContext("error", "[AnalyticsAggregation] Store day failed", {
                    storeUuid: day.storeUuid,
                    date: day.localDate,
                    error: error.message,
                });
            }
        }

        if (days.length > 0) {
            MetricsService.increment(failed > 0 ? "analytics_aggregation_failed" : "analytics_aggregation_completed");
            logWithContext("info", "[AnalyticsAggregation] Completed", {
                storeDays: days.length,
                computed,
                failed,
                durationMs: Date.now() - startTime,
            });
        }

        return { computed, failed };
    }

    static async aggregateStoreDay(day: StoreDay) {
        const { storeUuid, tenantUuid, dateKey } = day;
        const window = { gte: day.start, lt: day.end };
        const collected = { storeUuid, ...collectedPaymentsWhere(window) };

        const [payments, fees, refunds, paymentsFailed] = await Promise.all([
            prisma.payment.aggregate({
                where: collected,
                _sum: { amount: true, tax: true, discount: true },
                _count: { _all: true },
            }),
            prisma.settlement.aggregate({
                where: { payment: collected },
                _sum: { providerFee: true },
            }),
            prisma.refund.aggregate({
                where: { storeUuid, ...completedRefundsWhere(window) },
                _sum: { amount: true },
            }),
            prisma.payment.count({
                where: {
                    storeUuid,
                    status: "FAILED",
                    OR: [{ failedAt: window }, { failedAt: null, createdAt: window }],
                },
            }),
        ]);

        const gross = payments._sum.amount ?? 0;
        const refunded = refunds._sum.amount ?? 0;
        const succeeded = payments._count._all;
        const figures = {
            revenueGross: gross,
            revenueRefunded: refunded,
            revenueNet: gross - refunded - (fees._sum.providerFee ?? 0),
            revenueTax: payments._sum.tax ?? 0,
            revenueDiscount: payments._sum.discount ?? 0,
            paymentsSucceeded: succeeded,
            paymentsFailed,
            avgPaymentValue: succeeded > 0 ? Math.round(gross / succeeded) : 0,
        };

        return prisma.storeDailyMetrics.upsert({
            where: { tenantUuid_storeUuid_date: { tenantUuid, storeUuid, date: dateKey } },
            update: { ...figures, calculatedAt: new Date() },
            create: { tenantUuid, storeUuid, date: dateKey, ...figures },
        });
    }
}
