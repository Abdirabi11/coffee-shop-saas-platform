import { withCache } from "../../cache/cache.js";
import prisma from "../../config/prisma.ts"


interface MetricsFilter {
  tenantUuid?: string;
  storeUuid?: string;
  startDate: Date;
  endDate: Date;
}

export class PaymentAnalyticsService {
    static async getMetrics(input: MetricsFilter) {
        const where = {
            ...(input.tenantUuid && { tenantUuid: input.tenantUuid }),
            ...(input.storeUuid && { storeUuid: input.storeUuid }),
            createdAt: { gte: input.startDate, lte: input.endDate },
        };
    
        const cacheKey = `payment-analytics:${input.tenantUuid ?? "all"}:${input.storeUuid ?? "all"}:${input.startDate.toISOString()}`;
    
        return withCache(cacheKey, 120, async () => {
            const [
                total,
                byStatus,
                byMethod,
                successfulAgg,
                avgProcessingTime,
            ] = await Promise.all([
                prisma.payment.count({ where }),
        
                prisma.payment.groupBy({
                    by: ["status"],
                    where,
                    _count: true,
                }),
        
                prisma.payment.groupBy({
                    by: ["paymentMethod"],
                    where: {
                        ...where,
                        status: { in: ["PAID", "COMPLETED"] }, // FIX #3: Both statuses
                    },
                    _sum: { amount: true },
                    _count: true,
                }),
    
                prisma.payment.aggregate({
                    where: {
                        ...where,
                        status: { in: ["PAID", "COMPLETED"] }, // FIX #3: Both statuses
                    },
                    _sum: { amount: true },
                    _count: true,
                    _avg: { amount: true },
                }),
    
                // Average processing time — raw SQL for date diff
                prisma.$queryRaw<{ avg_seconds: number }[]>`
                SELECT AVG(
                    EXTRACT(EPOCH FROM ("paidAt" - "createdAt"))
                )::float as avg_seconds
                FROM "Payment"
                WHERE "paidAt" IS NOT NULL
                    AND status IN ('PAID', 'COMPLETED')
                    AND "createdAt" >= ${input.startDate}
                    AND "createdAt" <= ${input.endDate}
                    ${input.tenantUuid ? prisma.$queryRaw`AND "tenantUuid" = ${input.tenantUuid}` : prisma.$queryRaw``}
                    ${input.storeUuid ? prisma.$queryRaw`AND "storeUuid" = ${input.storeUuid}` : prisma.$queryRaw``}
                `,
            ]);
    
            // Build status map
            const statusMap: Record<string, number> = {};
            for (const s of byStatus) {
                statusMap[s.status] = s._count;
            };
        
            const successful = successfulAgg._count ?? 0;
            const totalAmount = successfulAgg._sum.amount ?? 0;
            const successRate = total > 0 ? (successful / total) * 100 : 0;
    
            return {
                total,
                successful,
                failed: statusMap["FAILED"] ?? 0,
                cancelled: statusMap["CANCELLED"] ?? 0,
                pending: statusMap["PENDING"] ?? 0,
                voided: statusMap["VOIDED"] ?? 0,
                successRate: Math.round(successRate * 100) / 100,
                totalAmount,
                averageAmount: Math.round((successfulAgg._avg.amount ?? 0) * 100) / 100,
                byMethod: byMethod.map((m) => ({
                    method: m.paymentMethod,
                    count: m._count,
                    amount: m._sum.amount ?? 0,
                })),
                byStatus: statusMap,
                avgProcessingTimeSeconds: Math.round(
                    avgProcessingTime[0]?.avg_seconds ?? 0
                ),
            };
        });
    }
 
    static async getFraudMetrics(input: {
        tenantUuid?: string;
        startDate: Date;
        endDate: Date;
    }) {
        const where = {
            ...(input.tenantUuid && { tenantUuid: input.tenantUuid }),
            createdAt: { gte: input.startDate, lte: input.endDate },
        };
    
        const cacheKey = `fraud-analytics:${input.tenantUuid ?? "all"}:${input.startDate.toISOString()}`;
    
        return withCache(cacheKey, 120, async () => {
            const [total, byType, bySeverity] = await Promise.all([
                prisma.fraudEvent.count({ where }),
        
                prisma.fraudEvent.groupBy({
                    by: ["type"],
                    where,
                    _count: true,
                    orderBy: { _count: { type: "desc" } },
                }),
        
                prisma.fraudEvent.groupBy({
                    by: ["severity"],
                    where,
                    _count: true,
                }),
            ]);
        
            const typeMap: Record<string, number> = {};
            for (const t of byType) {
                typeMap[t.type] = t._count;
            }
    
            const severityMap: Record<string, number> = {};
            for (const s of bySeverity) {
                severityMap[s.severity] = s._count;
            }
    
            return {
                total,
                byType: typeMap,
                bySeverity: severityMap,
            };
        });
    }
}