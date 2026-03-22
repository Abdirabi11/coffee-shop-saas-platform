import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { withCache } from "../../infrastructure/cache/redis.ts";
 
export class CashDrawerReportService {
    //SHIFT REPORT — generated when drawer is closed
    //This is the report a manager reviews before sign-off
    static async getShiftReport(drawerUuid: string) {
        const drawer = await prisma.cashDrawer.findUnique({
            where: { uuid: drawerUuid },
            include: {
                store: { select: { name: true, currency: true } },
            },
        });
    
        if (!drawer) {
            throw new Error("DRAWER_NOT_FOUND");
        }
    
        // Get all payments processed through this drawer's terminal during session
        const sessionStart = drawer.sessionStart;
        const sessionEnd = drawer.sessionEnd ?? new Date();
    
        const payments = await prisma.payment.findMany({
            where: {
                storeUuid: drawer.storeUuid,
                terminalId: drawer.terminalId,
                paymentFlow: "CASHIER",
                processedAt: { gte: sessionStart, lte: sessionEnd },
                status: { in: ["COMPLETED", "VOIDED"] },
            },
            select: {
                uuid: true,
                amount: true,
                paymentMethod: true,
                status: true,
                processedBy: true,
                processedAt: true,
                amountTendered: true,
                changeGiven: true,
                voidedAt: true,
                voidReason: true,
                order: {
                    select: { orderNumber: true },
                },
            },
            orderBy: { processedAt: "asc" },
        });
    
        // Separate active and voided
        const activePayments = payments.filter((p) => p.status === "COMPLETED");
        const voidedPayments = payments.filter((p) => p.status === "VOIDED");
    
        // Calculate totals
        const cashPayments = activePayments.filter((p) => p.paymentMethod === "CASH");
        const cardPayments = activePayments.filter((p) => p.paymentMethod === "CARD_TERMINAL");
    
        const cashTotal = cashPayments.reduce((s, p) => s + p.amount, 0);
        const cardTotal = cardPayments.reduce((s, p) => s + p.amount, 0);
        const voidedTotal = voidedPayments.reduce((s, p) => s + p.amount, 0);
    
        // Duration
        const durationMinutes = dayjs(sessionEnd).diff(dayjs(sessionStart), "minute");
        const durationFormatted = `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`;
    
        // Transaction rate
        const transactionsPerHour =
            durationMinutes > 0
                ? Math.round((activePayments.length / (durationMinutes / 60)) * 10) / 10
                : 0;
        
            return {
            drawer: {
                uuid: drawer.uuid,
                terminalId: drawer.terminalId,
                storeName: drawer.store.name,
                currency: drawer.store.currency,
                status: drawer.status,
            },
            session: {
                openedBy: drawer.openedBy,
                closedBy: drawer.closedBy,
                sessionStart: drawer.sessionStart,
                sessionEnd: drawer.sessionEnd,
                duration: durationFormatted,
                durationMinutes,
            },
            balances: {
                openingBalance: drawer.openingBalance,
                expectedCash: drawer.expectedCash,
                expectedCard: drawer.expectedCard,
                actualCash: drawer.actualCash,
                actualCard: drawer.actualCard,
                cashVariance: drawer.cashVariance,
                cardVariance: drawer.cardVariance,
            },
            transactions: {
                total: activePayments.length,
                cash: {
                    count: cashPayments.length,
                    total: cashTotal,
                },
                card: {
                    count: cardPayments.length,
                    total: cardTotal,
                },
                voided: {
                    count: voidedPayments.length,
                    total: voidedTotal,
                    details: voidedPayments.map((p) => ({
                        orderNumber: p.order.orderNumber,
                        amount: p.amount,
                        voidedAt: p.voidedAt,
                        reason: p.voidReason,
                    })),
                },
                totalSales: cashTotal + cardTotal,
                averageTransaction:
                activePayments.length > 0
                    ? Math.round((cashTotal + cardTotal) / activePayments.length)
                    : 0,
                transactionsPerHour,
            },
            variance: {
                hasCashVariance: Math.abs(drawer.cashVariance ?? 0) > 0,
                hasCardVariance: Math.abs(drawer.cardVariance ?? 0) > 0,
                cashVariance: drawer.cashVariance ?? 0,
                cardVariance: drawer.cardVariance ?? 0,
                totalVariance: (drawer.cashVariance ?? 0) + (drawer.cardVariance ?? 0),
                status:
                Math.abs((drawer.cashVariance ?? 0) + (drawer.cardVariance ?? 0)) <= 100
                    ? "BALANCED"
                    : Math.abs((drawer.cashVariance ?? 0) + (drawer.cardVariance ?? 0)) <= 500
                    ? "MINOR_VARIANCE"
                    : "SIGNIFICANT_VARIANCE",
            },
            closingNotes: drawer.closingNotes,
            // Full transaction log for audit
            transactionLog: activePayments.map((p) => ({
                orderNumber: p.order.orderNumber,
                amount: p.amount,
                method: p.paymentMethod,
                processedBy: p.processedBy,
                processedAt: p.processedAt,
                amountTendered: p.amountTendered,
                changeGiven: p.changeGiven,
            })),
        };
    }
 
    //SESSION HISTORY — list of drawer sessions for a store
    static async getSessionHistory(input: {
        storeUuid: string;
        days?: number;
        terminalId?: string;
        limit?: number;
    }) {
        const days = input.days ?? 7;
        const since = dayjs().subtract(days, "day").startOf("day").toDate();
    
        const cacheKey = `drawer:history:${input.storeUuid}:${input.terminalId ?? "all"}:${days}d`;
    
        return withCache(cacheKey, 120, async () => {
            const sessions = await prisma.cashDrawer.findMany({
                where: {
                    storeUuid: input.storeUuid,
                    sessionStart: { gte: since },
                    ...(input.terminalId && { terminalId: input.terminalId }),
                },
                orderBy: { sessionStart: "desc" },
                take: input.limit ?? 50,
                select: {
                    uuid: true,
                    terminalId: true,
                    status: true,
                    openedBy: true,
                    closedBy: true,
                    sessionStart: true,
                    sessionEnd: true,
                    openingBalance: true,
                    expectedCash: true,
                    actualCash: true,
                    cashVariance: true,
                    expectedCard: true,
                    actualCard: true,
                    cardVariance: true,
                    totalSales: true,
                    cashSalesCount: true,
                    cardSalesCount: true,
                    closingNotes: true,
                },
            });
        
            const totalSessions = sessions.length;
            const closedSessions = sessions.filter((s) => s.status === "CLOSED");
            const sessionsWithVariance = closedSessions.filter(
                (s) => Math.abs(s.cashVariance ?? 0) > 100 || Math.abs(s.cardVariance ?? 0) > 100
            );
    
            return {
                period: { days, since },
                sessions,
                summary: {
                    totalSessions,
                    openSessions: sessions.filter((s) => s.status === "OPEN").length,
                    closedSessions: closedSessions.length,
                    sessionsWithVariance: sessionsWithVariance.length,
                    totalSalesVolume: closedSessions.reduce(
                        (s, d) => s + (d.totalSales ?? 0),
                        0
                    ),
                    totalCashVariance: closedSessions.reduce(
                        (s, d) => s + Math.abs(d.cashVariance ?? 0),
                        0
                    ),
                },
            };
        });
    }
 
    //TERMINAL PERFORMANCE — compare terminals in a store
    static async getTerminalPerformance(storeUuid: string, days: number = 30) {
        const since = dayjs().subtract(days, "day").startOf("day").toDate();
    
        const cacheKey = `drawer:terminal-perf:${storeUuid}:${days}d`;
    
        return withCache(cacheKey, 600, async () => {
            const sessions = await prisma.cashDrawer.findMany({
                where: {
                    storeUuid,
                    status: "CLOSED",
                    sessionStart: { gte: since },
                },
                select: {
                    terminalId: true,
                    totalSales: true,
                    cashSalesCount: true,
                    cardSalesCount: true,
                    cashVariance: true,
                    cardVariance: true,
                    sessionStart: true,
                    sessionEnd: true,
                },
            });
        
            // Group by terminal
            const byTerminal = new Map<
                string,
                {
                    sessions: number;
                    totalSales: number;
                    totalTransactions: number;
                    totalVariance: number;
                    avgSessionDuration: number;
                }
            >();
    
            for (const s of sessions) {
                const existing = byTerminal.get(s.terminalId) ?? {
                    sessions: 0,
                    totalSales: 0,
                    totalTransactions: 0,
                    totalVariance: 0,
                    avgSessionDuration: 0,
                };
        
                const duration = s.sessionEnd
                    ? dayjs(s.sessionEnd).diff(dayjs(s.sessionStart), "minute")
                    : 0;
        
                existing.sessions++;
                existing.totalSales += s.totalSales ?? 0;
                existing.totalTransactions += (s.cashSalesCount ?? 0) + (s.cardSalesCount ?? 0);
                existing.totalVariance += Math.abs(s.cashVariance ?? 0) + Math.abs(s.cardVariance ?? 0);
                existing.avgSessionDuration += duration;
        
                byTerminal.set(s.terminalId, existing);
            }
        
            // Calculate averages
            return Array.from(byTerminal.entries())
                .map(([terminalId, data]) => ({
                    terminalId,
                    sessions: data.sessions,
                    totalSales: data.totalSales,
                    avgSalesPerSession:
                        data.sessions > 0 ? Math.round(data.totalSales / data.sessions) : 0,
                    totalTransactions: data.totalTransactions,
                    avgTransactionsPerSession:
                        data.sessions > 0
                        ? Math.round(data.totalTransactions / data.sessions)
                        : 0,
                    totalVariance: data.totalVariance,
                    avgVariance:
                        data.sessions > 0
                        ? Math.round(data.totalVariance / data.sessions)
                        : 0,
                    avgSessionDurationMinutes:
                        data.sessions > 0
                        ? Math.round(data.avgSessionDuration / data.sessions)
                        : 0,
                }))
                .sort((a, b) => b.totalSales - a.totalSales);
        });
    }
 
    //DAILY DRAWER SUMMARY — all drawers for a store on a given day
    static async getDailySummary(storeUuid: string, date?: Date) {
        const targetDate = date ?? new Date();
        const dayStart = dayjs(targetDate).startOf("day").toDate();
        const dayEnd = dayjs(targetDate).endOf("day").toDate();
    
        const drawers = await prisma.cashDrawer.findMany({
            where: {
                storeUuid,
                sessionStart: { gte: dayStart, lte: dayEnd },
            },
            orderBy: { sessionStart: "asc" },
        });
    
        const closed = drawers.filter((d) => d.status === "CLOSED");
        const open = drawers.filter((d) => d.status === "OPEN");
    
        return {
            date: dayStart,
            storeUuid,
            drawers: drawers.map((d) => ({
                uuid: d.uuid,
                terminalId: d.terminalId,
                status: d.status,
                openedBy: d.openedBy,
                closedBy: d.closedBy,
                sessionStart: d.sessionStart,
                sessionEnd: d.sessionEnd,
                totalSales: d.totalSales,
                cashVariance: d.cashVariance,
                cardVariance: d.cardVariance,
            })),
            summary: {
                totalSessions: drawers.length,
                openSessions: open.length,
                closedSessions: closed.length,
                totalSales: closed.reduce((s, d) => s + (d.totalSales ?? 0), 0),
                totalCashVariance: closed.reduce(
                (s, d) => s + (d.cashVariance ?? 0),
                0
                ),
                totalCardVariance: closed.reduce(
                    (s, d) => s + (d.cardVariance ?? 0),
                    0
                ),
                hasOpenDrawers: open.length > 0,
            },
        };
    }
}