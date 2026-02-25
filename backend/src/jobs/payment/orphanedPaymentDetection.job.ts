import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";


export class OrphanedPaymentDetectionJob{
    static async run(){
        const startTime = Date.now();
        logWithContext("info", "[OrphanedPaymentDetection] Starting detection job");
    
        console.log("[OrphanedPaymentDetection] Starting...");

        // Find payments without orders
        try {
            const orphanedPayments = await prisma.payment.findMany({
                where: {
                    createdAt: {
                        lt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Older than 24h
                    },
                },
                include: {
                    order: true,
                },
                take: 100,
            });

             // Filter actual orphans (no order or order doesn't match)
            const actualOrphans = orphanedPayments.filter(p => !p.order);

            if (actualOrphans.length === 0) {
                logWithContext("info", "[OrphanedPaymentDetection] No orphaned payments found");
                return;
            }

            logWithContext("error", "[OrphanedPaymentDetection] Found orphaned payments", {
                count: actualOrphans.length,
                paymentUuids: actualOrphans.map(p => p.uuid),
            });

            // Group by tenant for targeted alerts
            const byTenant = actualOrphans.reduce((acc, p) => {
                if (!acc[p.tenantUuid]) {
                    acc[p.tenantUuid] = [];
                }
                acc[p.tenantUuid].push(p);
                return acc;
            }, {} as Record<string, typeof actualOrphans>);

            for (const [tenantUuid, payments] of Object.entries(byTenant)) {
                const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);

                await prisma.adminAlert.create({
                    data: {
                        tenantUuid,
                        alertType: "ORPHANED_PAYMENTS_DETECTED",
                        category: "FINANCIAL",
                        level: "CRITICAL",
                        priority: "HIGH",
                        title: `${payments.length} Orphaned Payment${payments.length > 1 ? 's' : ''} Detected`,
                        message: `Found ${payments.length} payment(s) without valid orders - Total amount: ${totalAmount / 100} - REQUIRES MANUAL INVESTIGATION`,
                        context: {
                            paymentUuids: payments.map(p => p.uuid),
                            count: payments.length,
                            totalAmount,
                            payments: payments.map(p => ({
                            uuid: p.uuid,
                            amount: p.amount,
                            provider: p.provider,
                            providerRef: p.providerRef,
                            status: p.status,
                            createdAt: p.createdAt,
                            })),
                        },
                    },
                });

            };
        
            const duration = Date.now() - startTime;

            logWithContext("info", "[OrphanedPaymentDetection] Job completed", {
                total: orphanedPayments.length,
                orphaned: actualOrphans.length,
                durationMs: duration,
            });
      
            //double 
            MetricsService.timing("payment.orphan.detection.duration", duration);
            MetricsService.gauge("payment.orphaned.count", actualOrphans.length);
      
  
            if (actualOrphans.length > 0) {
                MetricsService.increment("payment.orphaned.detected", actualOrphans.length);
            }
        } catch (error: any) {
            logWithContext("error", "[OrphanedPaymentDetection] Job failed", {
                error: error.message,
                stack: error.stack,
            });
        
            MetricsService.increment("payment.orphan.detection.error", 1);
            throw error;
        }
    }
}