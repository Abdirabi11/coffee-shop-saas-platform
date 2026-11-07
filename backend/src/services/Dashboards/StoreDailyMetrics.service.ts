import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import type { Prisma } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { DailyReconciliationService } from "../payment/DailyReconciliation.service.ts";

dayjs.extend(utc);
dayjs.extend(timezone);
 
 
export class StoreDailyMetricsService {
    // The row key for the store's current local day: its local calendar date
    // at 00:00 UTC, the same key the nightly dailyStoreMetrics job and the
    // reconciliation use, so live increments and the nightly recompute land
    // on one row. Never the server's midnight.
    private static async todayKey(storeUuid: string, now: Date = new Date()): Promise<Date> {
        const store = await prisma.store.findUnique({
            where: { uuid: storeUuid },
            select: { timezone: true },
        });
        return StoreDailyMetricsService.localDateKey(store?.timezone, now);
    }

    private static localDateKey(timezone: string | null | undefined, now: Date): Date {
        const tz = DailyReconciliationService.safeTimezone(timezone);
        const localDate = dayjs(now).tz(tz).format("YYYY-MM-DD");
        return DailyReconciliationService.localDayWindow(tz, localDate).dateKey;
    }

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
        const today = await StoreDailyMetricsService.todayKey(input.storeUuid);
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
        const today = await StoreDailyMetricsService.todayKey(storeUuid);
    
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
        const today = await StoreDailyMetricsService.todayKey(storeUuid);
    
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
        const today = await StoreDailyMetricsService.todayKey(storeUuid);
    
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
        const today = await StoreDailyMetricsService.todayKey(storeUuid);

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
        const today = await StoreDailyMetricsService.todayKey(storeUuid);
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
 
    // date: a calendar day (its UTC date is taken). Without one, each store's
    // own current local day, which differs between stores in different zones.
    static async getTenantSummary(tenantUuid: string, date?: Date) {
        let where: Prisma.StoreDailyMetricsWhereInput;
        let reportedDate: string;
        if (date) {
            reportedDate = dayjs.utc(date).format("YYYY-MM-DD");
            where = { tenantUuid, date: new Date(`${reportedDate}T00:00:00.000Z`) };
        } else {
            const now = new Date();
            const stores = await prisma.store.findMany({
                where: { tenantUuid },
                select: { uuid: true, timezone: true },
            });
            const keys = stores.map((st) => ({
                storeUuid: st.uuid,
                date: StoreDailyMetricsService.localDateKey(st.timezone, now),
            }));
            reportedDate = "today";
            where = { tenantUuid, OR: keys.length > 0 ? keys : [{ storeUuid: "" }] };
        }
    
        const metrics = await prisma.storeDailyMetrics.findMany({
            where,
            include: { store: { select: { name: true } } },
        });
    
        return {
            date: reportedDate,
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
                date: dayjs.utc(m.date).format("YYYY-MM-DD"), // the store's local day
                revenueGross: m.revenueGross,
                revenueNet: m.revenueNet,
                ordersCompleted: m.ordersCompleted,
                paymentsFailed: m.paymentsFailed,
                avgPaymentValue: m.avgPaymentValue,
            })),
        };
    }
}