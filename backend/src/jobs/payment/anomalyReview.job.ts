import prisma from "../../config/prisma.ts"

export class AnomalyReviewJob {
    static async run() {
        const anomalies = await prisma.paymentAnomaly.findMany({
            where: {
                status: "PENDING",
                severity: { in: ["HIGH", "CRITICAL"] },
            },
            include: {
                payment: {
                    include: {
                        order: true,
                    },
                },
            },
        });

        if (anomalies.length === 0) {
            console.log("[AnomalyReview] No pending high-severity anomalies");
            return;
        };
      
        // Group by store
        const byStore = anomalies.reduce((acc, anomaly) => {
            if (!acc[anomaly.storeUuid]) {
                acc[anomaly.storeUuid] = [];
            }
            acc[anomaly.storeUuid].push(anomaly);
            return acc;
        }, {} as Record<string, typeof anomalies>);
      
        // Notify managers for each store
        for (const [storeUuid, storeAnomalies] of Object.entries(byStore)) {
            await prisma.adminAlert.create({
                data: {
                    tenantUuid: storeAnomalies[0].tenantUuid,
                    storeUuid,
                    alertType: "PAYMENT_ANOMALY",
                    category: "FINANCIAL",
                    level: "WARNING",
                    priority: "HIGH",
                    title: `${storeAnomalies.length} Payment Anomalies Need Review`,
                    message: `${storeAnomalies.length} suspicious payments detected and require manager review`,
                    context: {
                        anomalies: storeAnomalies.map((a) => ({
                            paymentUuid: a.paymentUuid,
                            type: a.anomalyType,
                            severity: a.severity,
                            amount: a.payment.amount,
                        })),
                    },
                },
            });
        };
      
        console.log(`[AnomalyReview] Created alerts for ${Object.keys(byStore).length} stores`);
    }
}