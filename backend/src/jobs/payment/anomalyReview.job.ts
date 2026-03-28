import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";

export class AnomalyReviewJob {
    static cronSchedule = "0 * * * *";
 
    static async run() {
        logWithContext("info", "[AnomalyReview] Starting");
    
        const anomalies = await prisma.paymentAnomaly.findMany({
            where: {
                status: "PENDING",
                severity: { in: ["HIGH", "CRITICAL"] },
            },
            include: {
                payment: {
                    select: { uuid: true, amount: true, storeUuid: true },
                },
            },
        });
    
        if (anomalies.length === 0) {
            logWithContext("info", "[AnomalyReview] No pending high-severity anomalies");
            return { alertsCreated: 0 };
        };
 
        // Group by store
        const byStore = new Map<string, typeof anomalies>();
        for (const anomaly of anomalies) {
            const key = anomaly.storeUuid;
            if (!byStore.has(key)) byStore.set(key, []);
            byStore.get(key)!.push(anomaly);
        }
    
        let alertsCreated = 0;
 
        for (const [storeUuid, storeAnomalies] of byStore) {
            await prisma.adminAlert.create({
                data: {
                    tenantUuid: storeAnomalies[0].tenantUuid,
                    storeUuid,
                    alertType: "PAYMENT_FAILED", 
                    category: "FINANCIAL",
                    level: "WARNING",
                    priority: "HIGH",
                    source: "AUTOMATED_CHECK",
                    title: `${storeAnomalies.length} Payment Anomalies Need Review`,
                    message: `${storeAnomalies.length} suspicious payments detected requiring manager review`,
                    context: {
                        subType: "PAYMENT_ANOMALY_BATCH",
                        anomalyCount: storeAnomalies.length,
                        anomalies: storeAnomalies.map((a) => ({
                            uuid: a.uuid,
                            paymentUuid: a.paymentUuid,
                            type: a.anomalyType,
                            severity: a.severity,
                            amount: a.payment.amount,
                        })),
                    },
                },
            });
            alertsCreated++;
        }
    
        logWithContext("info", "[AnomalyReview] Completed", {
            anomalies: anomalies.length,
            stores: byStore.size,
            alertsCreated,
        });
    
        return { alertsCreated };
    }
}