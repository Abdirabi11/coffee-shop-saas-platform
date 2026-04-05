import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { withCache } from "../../cache/cache.ts";
 
const prisma = new PrismaClient();
 
export class SettlementService {
    //RECORD PENDING SETTLEMENT
    //Called from PAYMENT_CONFIRMED event handler for provider payments
    static async recordPending(input: {
        tenantUuid: string;
        storeUuid: string;
        paymentUuid: string;
        provider: string;
        providerRef: string;
        amount: number;
        fee?: number;
        currency: string;
    }) {
        try {
            // Idempotency — don't double-record
            const existing = await prisma.settlement.findFirst({
                where: { paymentUuid: input.paymentUuid },
            });
            if (existing) return existing;
        
            const settlement = await prisma.settlement.create({
                data: {
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    paymentUuid: input.paymentUuid,
                    provider: input.provider,
                    providerRef: input.providerRef,
                    grossAmount: input.amount,
                    providerFee: input.fee ?? 0,
                    netAmount: input.amount - (input.fee ?? 0),
                    currency: input.currency,
                    status: "PENDING",
                    // Estimated settlement: Stripe = 2 business days, EVC = 1 day
                    estimatedSettlementAt: this.estimateSettlementDate(input.provider),
                },
            });
        
            return settlement;
        } catch (error: any) {
            logWithContext("error", "[Settlement] recordPending failed", {
                paymentUuid: input.paymentUuid,
                error: error.message,
            });
        }
    }
 
    //MARK AS SETTLED (called by sync job)
    static async markSettled(input: {
        paymentUuid?: string;
        providerRef?: string;
        providerPayoutId: string;
        settledAt: Date;
        netAmount: number;
        fee: number;
    }) {
        const where = input.paymentUuid
            ? { paymentUuid: input.paymentUuid }
            : input.providerRef
                ? { providerRef: input.providerRef }
                : null;
    
        if (!where) throw new Error("SETTLEMENT_IDENTIFIER_REQUIRED");
    
        const settlement = await prisma.settlement.findFirst({
            where: { ...where, status: "PENDING" },
        });
    
        if (!settlement) return null;
    
        return prisma.settlement.update({
            where: { uuid: settlement.uuid },
            data: {
                status: "SETTLED",
                settledAt: input.settledAt,
                providerPayoutId: input.providerPayoutId,
                providerFee: input.fee,
                netAmount: input.netAmount,
            },
        });
    }
    
    //SETTLEMENT DASHBOARD — pending vs settled breakdown
    static async getDashboard(tenantUuid: string) {
        const cacheKey = `settlement:dashboard:${tenantUuid}`;
    
        return withCache(cacheKey, 120, async () => {
            const last30d = dayjs().subtract(30, "day").toDate();
        
            const [pending, settled, byProvider, recentPayouts] = await Promise.all([
                // Total pending settlement
                prisma.settlement.aggregate({
                    where: { tenantUuid, status: "PENDING" },
                    _sum: { grossAmount: true, netAmount: true, providerFee: true },
                    _count: true,
                }),
        
                // Total settled last 30 days
                prisma.settlement.aggregate({
                    where: {
                        tenantUuid,
                        status: "SETTLED",
                        settledAt: { gte: last30d },
                    },
                    _sum: { grossAmount: true, netAmount: true, providerFee: true },
                    _count: true,
                }),
        
                // Breakdown by provider
                prisma.settlement.groupBy({
                    by: ["provider", "status"],
                    where: { tenantUuid, createdAt: { gte: last30d } },
                    _sum: { grossAmount: true, netAmount: true, providerFee: true },
                    _count: true,
                }),
        
                // Last 10 settled payouts
                prisma.settlement.findMany({
                    where: { tenantUuid, status: "SETTLED" },
                    orderBy: { settledAt: "desc" },
                    take: 10,
                    select: {
                        uuid: true,
                        provider: true,
                        grossAmount: true,
                        netAmount: true,
                        providerFee: true,
                        settledAt: true,
                        providerPayoutId: true,
                    },
                }),
            ]);
        
            // Build provider breakdown
            const providerSummary: Record<
                string,
                { pending: number; settled: number; fees: number }
            > = {};
    
            for (const p of byProvider) {
                if (!providerSummary[p.provider]) {
                    providerSummary[p.provider] = { pending: 0, settled: 0, fees: 0 };
                }
                if (p.status === "PENDING") {
                    providerSummary[p.provider].pending += p._sum.netAmount ?? 0;
                } else if (p.status === "SETTLED") {
                    providerSummary[p.provider].settled += p._sum.netAmount ?? 0;
                    providerSummary[p.provider].fees += p._sum.providerFee ?? 0;
                }
            }
        
            return {
                pending: {
                    count: pending._count,
                    grossAmount: pending._sum.grossAmount ?? 0,
                    netAmount: pending._sum.netAmount ?? 0,
                    estimatedFees: pending._sum.providerFee ?? 0,
                },
                settled: {
                    count: settled._count,
                    grossAmount: settled._sum.grossAmount ?? 0,
                    netAmount: settled._sum.netAmount ?? 0,
                    totalFees: settled._sum.providerFee ?? 0,
                },
                byProvider: providerSummary,
                recentPayouts,
                inTransit: {
                    amount: (pending._sum.netAmount ?? 0),
                    description: "Funds being processed by payment providers",
                },
            };
        });
    }
 
    //SETTLEMENT HISTORY with pagination
    static async getHistory(input: {
        tenantUuid: string;
        provider?: string;
        status?: string;
        from?: Date;
        to?: Date;
        limit?: number;
        offset?: number;
    }) {
        const limit = input.limit ?? 50;
        const offset = input.offset ?? 0;
    
        const where = {
            tenantUuid: input.tenantUuid,
            ...(input.provider && { provider: input.provider }),
            ...(input.status && { status: input.status }),
            ...(input.from && input.to && {
                createdAt: { gte: input.from, lte: input.to },
            }),
        };
    
        const [settlements, total] = await Promise.all([
            prisma.settlement.findMany({
                where,
                orderBy: { createdAt: "desc" },
                take: limit,
                skip: offset,
                include: {
                payment: {
                    select: {
                    uuid: true,
                    orderUuid: true,
                    amount: true,
                    order: { select: { orderNumber: true } },
                    },
                },
                },
            }),
            prisma.settlement.count({ where }),
        ]);
    
        return {
            settlements,
            pagination: { total, limit, offset, hasMore: offset + limit < total },
        };
    }

    private static estimateSettlementDate(provider: string): Date {
        switch (provider.toUpperCase()) {
            case "STRIPE":
                // Stripe: typically 2 business days
                return dayjs().add(2, "day").toDate();
            case "EVC_PLUS":
                // EVC Plus: typically next business day
                return dayjs().add(1, "day").toDate();
            default:
                return dayjs().add(3, "day").toDate();
        }
    }
}