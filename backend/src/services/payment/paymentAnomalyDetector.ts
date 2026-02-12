import prisma from "../../config/prisma.ts"

export class PaymentAnomalyDetector{
    static async analyze(paymentUuid: string) {
        const payment = await prisma.payment.findUnique({
            where: { uuid: paymentUuid },
            include: { order: true },
        });

        if (!payment) return;

        const anomalies: Array<{
            type: string;
            severity: string;
            description: string;
            evidence: any;
        }> = [];

        //Large cash payment
        if (payment.paymentMethod === "CASH" && payment.amount > 50000) {
            anomalies.push({
                type: "LARGE_CASH_PAYMENT",
                severity: payment.amount > 100000 ? "HIGH" : "MEDIUM",
                description: `Large cash payment: ${payment.amount / 100}`,
                evidence: { amount: payment.amount },
            });
        };

        //Round amount (suspicious)
        if (payment.amount % 10000 === 0 && payment.amount > 10000) {
            anomalies.push({
                type: "ROUND_AMOUNT",
                severity: "LOW",
                description: "Suspiciously round payment amount",
                evidence: { amount: payment.amount },
            });
        };

        //Missing change calculation for cash
        if (payment.paymentMethod === "CASH" && !payment.changeGiven) {
            anomalies.push({
                type: "MISSING_CHANGE_CALC",
                severity: "MEDIUM",
                description: "Cash payment with no change calculation",
                evidence: {
                    amount: payment.amount,
                    amountTendered: payment.amountTendered,
                },
            });
        };

        //Velocity spike (same staff, many payments quickly)
        const recentPayments = await prisma.payment.count({
            where: {
                processedBy: payment.processedBy,
                processedAt: {
                    gte: new Date(Date.now() - 5 * 60 * 1000), // Last 5 min
                },
            },
        });
  
        if (recentPayments > 10) {
            anomalies.push({
                type: "VELOCITY_SPIKE",
                severity: "HIGH",
                description: `${recentPayments} payments in 5 minutes`,
                evidence: { count: recentPayments, staffUuid: payment.processedBy },
            });
        };
  
        //Off-hours payment (customize based on store hours)
        const hour= payment.processedAt.getHours();
        if (hour < 6 || hour > 23) {
            anomalies.push({
                type: "OFF_HOURS_PAYMENT",
                severity: "MEDIUM",
                description: `Payment processed at ${hour}:00`,
                evidence: { hour },
            });
        };
  
        //Store anomalies if found
        for (const anomaly of anomalies) {
            await prisma.paymentAnomaly.create({
                data: {
                    tenantUuid: payment.tenantUuid,
                    storeUuid: payment.storeUuid,
                    paymentUuid: payment.uuid,
                    orderUuid: payment.orderUuid,
                    anomalyType: anomaly.type,
                    severity: anomaly.severity,
                    description: anomaly.description,
                    evidence: anomaly.evidence,
                    detectedBy: "SYSTEM",
                    detectionMethod: "RULE_BASED",
                },
            });
  
            // Flag payment if high severity
            if (anomaly.severity === "HIGH" || anomaly.severity === "CRITICAL") {
                await prisma.payment.update({
                    where: { uuid: paymentUuid },
                    data: {
                        flaggedForReview: true,
                        flagReason: anomaly.description,
                        flaggedAt: new Date(),
                    },
                });
            }
        };
  
        if (anomalies.length > 0) {
            console.log(`[AnomalyDetector] Found ${anomalies.length} anomalies for payment ${paymentUuid}`);
        }
  
        return anomalies;
    }
}