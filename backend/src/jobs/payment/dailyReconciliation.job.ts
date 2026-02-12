import dayjs from "dayjs";
import { prisma } from "../../config/prisma.ts"


export class DailyReconciliationJob{
    static async run(date: Date = new Date()) {
        const startOfDay = dayjs(date).startOf("day").toDate();
        const endOfDay = dayjs(date).endOf("day").toDate();
    
        console.log(`[DailyReconciliation] Running for ${startOfDay.toISOString()}`);
    
        // Get all stores
        const stores = await prisma.store.findMany({
            where: { status: "ACTIVE" },
        });
    
        for (const store of stores) {
            try {
                await this.reconcileStore(store.uuid, startOfDay, endOfDay);
            } catch (error: any) {
                console.error(`[DailyReconciliation] Failed for store ${store.uuid}:`, error.message);
            }
        }
    }

    private static async reconcileStore(
        storeUuid: string,
        startOfDay: Date,
        endOfDay: Date
    ) {
        // Get all completed payments for the day
        const payments = await prisma.payment.findMany({
            where: {
                storeUuid,
                status: "COMPLETED",
                paymentFlow: "CASHIER",
                processedAt: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
            },
        });
    
        // Calculate totals by method
        const cashTotal = payments
          .filter((p) => p.paymentMethod === "CASH")
          .reduce((sum, p) => sum + p.amount, 0);
    
        const cardTotal = payments
          .filter((p) => p.paymentMethod === "CARD_TERMINAL")
          .reduce((sum, p) => sum + p.amount, 0);
    
        const totalPayments = cashTotal + cardTotal;
    
        // Get orders total for validation
        const orders = await prisma.order.findMany({
            where: {
                storeUuid,
                status: "COMPLETED",
                createdAt: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
            },
        });
    
        const ordersTotal = orders.reduce((sum, o) => sum + o.totalAmount, 0);
    
        // Detect variance
        const variance = totalPayments - ordersTotal;
        const hasVariance = Math.abs(variance) > 100; // >$1 difference
    
        // Find missing/extra payments
        const orderUuids = new Set(orders.map((o) => o.uuid));
        const paymentOrderUuids = new Set(payments.map((p) => p.orderUuid));
    
        const missingPayments = orders
          .filter((o) => !paymentOrderUuids.has(o.uuid))
          .map((o) => o.uuid);
    
        const extraPayments = payments
          .filter((p) => !orderUuids.has(p.orderUuid))
          .map((p) => p.uuid);
    
        // Create or update reconciliation report
        await prisma.dailyReconciliation.upsert({
            where: {
                storeUuid_date: {
                    storeUuid,
                    date: startOfDay,
                },
            },
            update: {
                ordersCount: orders.length,
                ordersTotal,
                cashDeclared: cashTotal,
                cardDeclared: cardTotal,
                totalDeclared: totalPayments,
                totalVariance: variance,
                variancePercent: ordersTotal > 0 ? (variance / ordersTotal) * 100 : 0,
                hasVariance,
                missingPayments,
                extraPayments,
                status: hasVariance ? "NEEDS_REVIEW" : "RECONCILED",
            },
            create: {
                storeUuid,
                tenantUuid: (await prisma.store.findUnique({ where: { uuid: storeUuid } }))!.tenantUuid,
                date: startOfDay,
                ordersCount: orders.length,
                ordersTotal,
                cashDeclared: cashTotal,
                cardDeclared: cardTotal,
                totalDeclared: totalPayments,
                totalVariance: variance,
                variancePercent: ordersTotal > 0 ? (variance / ordersTotal) * 100 : 0,
                hasVariance,
                requiresReview: hasVariance,
                missingPayments,
                extraPayments,
                status: hasVariance ? "NEEDS_REVIEW" : "RECONCILED",
                reconciledBy: "SYSTEM",
            },
        });
    
        console.log(`[DailyReconciliation] Store ${storeUuid}: ${totalPayments / 100} (variance: ${variance / 100})`);
    }
};