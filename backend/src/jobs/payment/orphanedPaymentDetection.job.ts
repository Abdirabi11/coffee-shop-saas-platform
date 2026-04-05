import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";

export class OrphanedPaymentDetectionJob {
    static cronSchedule = "0 4 * * *";
    
    static async run() {
        const startTime = Date.now();
        logWithContext("info", "[OrphanedPayment] Starting");
    
        try {
            const stuckPayments = await prisma.payment.findMany({
                where: {
                    status: "PENDING",
                    createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
                },
                include: {
                    order: { select: { uuid: true, status: true } },
                },
                take: 100,
            });
    
            // Payments whose orders are in a terminal state but payment is still pending
            const orphans = stuckPayments.filter(
                (p) =>
                !p.order ||
                p.order.status === "CANCELLED" ||
                p.order.status === "COMPLETED"
            );
        
            if (orphans.length === 0) {
                logWithContext("info", "[OrphanedPayment] No orphans found");
                return { count: 0 };
            };
        
            // Group by tenant
            const byTenant = new Map<string, typeof orphans>();
            for (const p of orphans) {
                if (!byTenant.has(p.tenantUuid)) byTenant.set(p.tenantUuid, []);
                byTenant.get(p.tenantUuid)!.push(p);
            };
    
            for (const [tenantUuid, payments] of byTenant) {
                const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
        
                await prisma.adminAlert.create({
                    data: {
                        tenantUuid,
                        alertType: "DATA_INCONSISTENCY", 
                        category: "FINANCIAL",
                        level: "CRITICAL",
                        priority: "HIGH",
                        source: "AUTOMATED_CHECK",
                        title: `${payments.length} Orphaned Payment(s) Detected`,
                        message: `Found ${payments.length} stuck payment(s) totaling ${totalAmount / 100} — requires investigation`,
                        context: {
                            paymentUuids: payments.map((p) => p.uuid),
                            count: payments.length,
                            totalAmount,
                        },
                    },
                });
            }
        
            const duration = Date.now() - startTime;
            logWithContext("warn", "[OrphanedPayment] Completed — orphans found", {
                total: stuckPayments.length,
                orphaned: orphans.length,
                durationMs: duration,
            });
        
            MetricsService.increment("payment.orphaned.detected", orphans.length);
        
            return { count: orphans.length };
        } catch (error: any) {
            logWithContext("error", "[OrphanedPayment] Fatal error", {
                error: error.message,
            });
            throw error;
        }
    }
}