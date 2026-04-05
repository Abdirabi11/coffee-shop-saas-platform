import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
 
 
export class StoreDailyMetricsService {
    //Called on every successful payment 
    static async recordPayment(input: {
        tenantUuid: string;
        storeUuid: string;
        amount: number;
        tax?: number;
        discount?: number;
        paymentMethod: string;
        paymentFlow: "CASHIER" | "PROVIDER";
    }) {
        const today = dayjs().startOf("day").toDate();
        const tax = input.tax ?? 0;
        const discount = input.discount ?? 0;
    
        try {
            await prisma.storeDailyMetrics.upsert({
                where: {
                    tenantUuid_storeUuid_date: {
                        tenantUuid: input.tenantUuid,
                        storeUuid: input.storeUuid,
                        date: today,
                    },
                },
                update: {
                    revenueGross: { increment: input.amount },
                    revenueNet: { increment: input.amount - tax - discount },
                    revenueTax: { increment: tax },
                    revenueDiscount: { increment: discount },
                    ordersCompleted: { increment: 1 },
                    ordersTotal: { increment: 1 },
                    paymentsSucceeded: { increment: 1 },
                },
                create: {
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    date: today,
                    revenueGross: input.amount,
                    revenueNet: input.amount - tax - discount,
                    revenueTax: tax,
                    revenueDiscount: discount,
                    revenueRefunded: 0,
                    ordersTotal: 1,
                    ordersCompleted: 1,
                    ordersCancelled: 0,
                    ordersPending: 0,
                    paymentsSucceeded: 1,
                    paymentsFailed: 0,
                    avgPaymentValue: input.amount,
                    avgPrepTimeMin: 0,
                    avgWaitTimeMin: 0,
                },
            });
        
            // Recalculate average
            await this.updateAverages(input.tenantUuid, input.storeUuid, today);
        } catch (error: any) {
            logWithContext("error", "[StoreDailyMetrics] recordPayment failed", {
                storeUuid: input.storeUuid,
                error: error.message,
            });
        }
    }
 
    //Called on payment failure 
    static async recordFailedPayment(tenantUuid: string, storeUuid: string) {
        const today = dayjs().startOf("day").toDate();
    
        try {
            await prisma.storeDailyMetrics.upsert({
                where: {
                    tenantUuid_storeUuid_date: { tenantUuid, storeUuid, date: today },
                },
                update: { paymentsFailed: { increment: 1 } },
                create: {
                    tenantUuid,
                    storeUuid,
                    date: today,
                    paymentsFailed: 1,
                    avgPrepTimeMin: 0,
                    avgWaitTimeMin: 0,
                },
            });
        } catch (error: any) {
            logWithContext("error", "[StoreDailyMetrics] recordFailedPayment failed", {
                storeUuid,
                error: error.message,
            });
        }
    }
 
    //Called on refund completion 
    static async recordRefund(tenantUuid: string, storeUuid: string, amount: number) {
        const today = dayjs().startOf("day").toDate();
    
        try {
            await prisma.storeDailyMetrics.upsert({
                where: {
                    tenantUuid_storeUuid_date: { tenantUuid, storeUuid, date: today },
                },
                update: {
                    revenueRefunded: { increment: amount },
                    revenueNet: { decrement: amount },
                },
                create: {
                    tenantUuid,
                    storeUuid,
                    date: today,
                    revenueRefunded: amount,
                    revenueNet: -amount,
                    avgPrepTimeMin: 0,
                    avgWaitTimeMin: 0,
                },
            });
        } catch (error: any) {
            logWithContext("error", "[StoreDailyMetrics] recordRefund failed", {
                storeUuid,
                error: error.message,
            });
        }
    }
 
    //Called on void
    static async recordVoid(tenantUuid: string, storeUuid: string, amount: number) {
        const today = dayjs().startOf("day").toDate();
    
        try {
            await prisma.storeDailyMetrics.upsert({
                where: {
                    tenantUuid_storeUuid_date: { tenantUuid, storeUuid, date: today },
                },
                update: {
                    revenueGross: { decrement: amount },
                    revenueNet: { decrement: amount },
                    ordersCompleted: { decrement: 1 },
                    paymentsSucceeded: { decrement: 1 },
                },
                create: {
                    tenantUuid,
                    storeUuid,
                    date: today,
                    avgPrepTimeMin: 0,
                    avgWaitTimeMin: 0,
                },
            });
        
            await this.updateAverages(tenantUuid, storeUuid, today);
        } catch (error: any) {
            logWithContext("error", "[StoreDailyMetrics] recordVoid failed", {
                storeUuid,
                error: error.message,
            });
        }
    }
 
    //Called on order cancellation
    static async recordCancellation(tenantUuid: string, storeUuid: string) {
        const today = dayjs().startOf("day").toDate();

        try {
            await prisma.storeDailyMetrics.upsert({
                where: {
                    tenantUuid_storeUuid_date: { tenantUuid, storeUuid, date: today },
                },
                update: { ordersCancelled: { increment: 1 } },
                create: {
                    tenantUuid,
                    storeUuid,
                    date: today,
                    ordersCancelled: 1,
                    avgPrepTimeMin: 0,
                    avgWaitTimeMin: 0,
                },
            });
        } catch (error: any) {
            logWithContext("error", "[StoreDailyMetrics] recordCancellation failed", {
                storeUuid,
                error: error.message,
            });
        }
    }
 
    //Recalculate averages
    private static async updateAverages(
        tenantUuid: string,
        storeUuid: string,
        date: Date
    ) {
        const metrics = await prisma.storeDailyMetrics.findUnique({
            where: { tenantUuid_storeUuid_date: { tenantUuid, storeUuid, date } },
            select: { revenueGross: true, paymentsSucceeded: true },
        });
    
        if (metrics && metrics.paymentsSucceeded > 0) {
            await prisma.storeDailyMetrics.update({
                where: { tenantUuid_storeUuid_date: { tenantUuid, storeUuid, date } },
                data: {
                    avgPaymentValue: Math.round(
                        metrics.revenueGross / metrics.paymentsSucceeded
                    ),
                },
            });
        }
    }
 
    //Read methods (for dashboards)
    static async getToday(tenantUuid: string, storeUuid: string) {
        const today = dayjs().startOf("day").toDate();
        return prisma.storeDailyMetrics.findUnique({
            where: { tenantUuid_storeUuid_date: { tenantUuid, storeUuid, date: today } },
        });
    }
 
    static async getRange(tenantUuid: string, storeUuid: string, from: Date, to: Date) {
        return prisma.storeDailyMetrics.findMany({
            where: { tenantUuid, storeUuid, date: { gte: from, lte: to } },
            orderBy: { date: "asc" },
        });
    }
 
    static async getTenantSummary(tenantUuid: string, date?: Date) {
        const targetDate = date
            ? dayjs(date).startOf("day").toDate()
            : dayjs().startOf("day").toDate();
    
        const metrics = await prisma.storeDailyMetrics.findMany({
            where: { tenantUuid, date: targetDate },
            include: { store: { select: { name: true } } },
        });
    
        return {
            date: targetDate,
            storeCount: metrics.length,
            totals: {
                revenueGross: metrics.reduce((s, m) => s + m.revenueGross, 0),
                revenueNet: metrics.reduce((s, m) => s + m.revenueNet, 0),
                ordersCompleted: metrics.reduce((s, m) => s + m.ordersCompleted, 0),
                ordersCancelled: metrics.reduce((s, m) => s + m.ordersCancelled, 0),
                paymentsFailed: metrics.reduce((s, m) => s + m.paymentsFailed, 0),
                revenueRefunded: metrics.reduce((s, m) => s + m.revenueRefunded, 0),
            },
            byStore: metrics.map((m) => ({
                storeUuid: m.storeUuid,
                storeName: (m as any).store?.name ?? "Unknown",
                revenueGross: m.revenueGross,
                revenueNet: m.revenueNet,
                ordersCompleted: m.ordersCompleted,
                paymentsFailed: m.paymentsFailed,
                avgPaymentValue: m.avgPaymentValue,
            })),
        };
    }
}