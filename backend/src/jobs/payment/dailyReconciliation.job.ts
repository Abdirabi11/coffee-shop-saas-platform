import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";


export class DailyReconciliationJob {
    static cronSchedule = "0 1 * * *";
    
    static async run(date: Date = new Date()) {
        const startOfDay = dayjs(date).startOf("day").toDate();
        const endOfDay = dayjs(date).endOf("day").toDate();
    
        logWithContext("info", "[DailyReconciliation] Starting", {
            date: startOfDay.toISOString(),
        });
    
        const stores = await prisma.store.findMany({
            where: { status: "ACTIVE" },
            select: { uuid: true, tenantUuid: true, name: true },
        });
    
        let reconciled = 0;
        let withVariance = 0;
        let failed = 0;
    
        for (const store of stores) {
            try {
                const result = await this.reconcileStore(
                    store.uuid,
                    store.tenantUuid,
                    startOfDay,
                    endOfDay
                );
                reconciled++;
                if (result.hasVariance) withVariance++;
            } catch (error: any) {
                failed++;
                logWithContext("error", "[DailyReconciliation] Store failed", {
                    storeUuid: store.uuid,
                    error: error.message,
                });
            }
        }
    
        logWithContext("info", "[DailyReconciliation] Completed", {
        stores: stores.length,
        reconciled,
        withVariance,
        failed,
        });
    
        return { reconciled, withVariance, failed };
    }
    
    private static async reconcileStore(
        storeUuid: string,
        tenantUuid: string,
        startOfDay: Date,
        endOfDay: Date
    ) {
        //Using DB aggregation instead of loading all records
        const [cashAgg, cardAgg, orderAgg, paymentCount, orderCount] =
            await Promise.all([
                // Cash total
                prisma.payment.aggregate({
                    where: {
                        storeUuid,
                        status: "COMPLETED",
                        paymentFlow: "CASHIER",
                        paymentMethod: "CASH",
                        processedAt: { gte: startOfDay, lte: endOfDay },
                    },
                    _sum: { amount: true },
                    _count: true,
                }),
                // Card total
                prisma.payment.aggregate({
                    where: {
                        storeUuid,
                        status: "COMPLETED",
                        paymentFlow: "CASHIER",
                        paymentMethod: "CARD_TERMINAL",
                        processedAt: { gte: startOfDay, lte: endOfDay },
                    },
                    _sum: { amount: true },
                    _count: true,
                }),
                // Orders total
                prisma.order.aggregate({
                    where: {
                        storeUuid,
                        status: "COMPLETED",
                        createdAt: { gte: startOfDay, lte: endOfDay },
                    },
                    _sum: { totalAmount: true },
                    _count: true,
                }),
                // Payment count (for missing detection)
                prisma.payment.count({
                    where: {
                        storeUuid,
                        paymentFlow: "CASHIER",
                        processedAt: { gte: startOfDay, lte: endOfDay },
                    },
                }),
                // Order count
                prisma.order.count({
                    where: {
                        storeUuid,
                        status: "COMPLETED",
                        createdAt: { gte: startOfDay, lte: endOfDay },
                    },
                }),
            ]);
    
        const cashTotal = cashAgg._sum.amount ?? 0;
        const cardTotal = cardAgg._sum.amount ?? 0;
        const totalPayments = cashTotal + cardTotal;
        const ordersTotal = orderAgg._sum.totalAmount ?? 0;
        const variance = totalPayments - ordersTotal;
        const hasVariance = Math.abs(variance) > 100;
    
        await prisma.dailyReconciliation.upsert({
            where: {
                storeUuid_date: { storeUuid, date: startOfDay },
            },
            update: {
                ordersCount: orderCount,
                ordersTotal,
                cashDeclared: cashTotal,
                cardDeclared: cardTotal,
                totalDeclared: totalPayments,
                totalVariance: variance,
                variancePercent: ordersTotal > 0 ? (variance / ordersTotal) * 100 : 0,
                hasVariance,
                status: hasVariance ? "NEEDS_REVIEW" : "RECONCILED",
            },
            create: {
                storeUuid,
                tenantUuid,
                date: startOfDay,
                ordersCount: orderCount,
                ordersTotal,
                cashDeclared: cashTotal,
                cardDeclared: cardTotal,
                totalDeclared: totalPayments,
                totalVariance: variance,
                variancePercent: ordersTotal > 0 ? (variance / ordersTotal) * 100 : 0,
                hasVariance,
                requiresReview: hasVariance,
                status: hasVariance ? "NEEDS_REVIEW" : "RECONCILED",
                reconciledBy: "SYSTEM",
            },
        });
    
        logWithContext(hasVariance ? "warn" : "info", "[DailyReconciliation] Store reconciled", {
            storeUuid,
            totalPayments,
            ordersTotal,
            variance,
            hasVariance,
        });
    
        return { hasVariance, variance };
    }
}