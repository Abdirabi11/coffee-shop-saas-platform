import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";

export class WebhookMonitoringJob {
  
    //Monitor webhook health and create alerts
    static async run() {
        const startTime = Date.now();

        logWithContext("info", "[WebhookMonitoring] Starting monitoring job");

        try {
            const last24h = dayjs().subtract(24, "hour").toDate();

            // Check for webhooks with high failure rates
            await this.checkFailureRates(last24h);

            // Check for stuck deliveries
            await this.checkStuckDeliveries();

            // Check DLQ size
            await this.checkDLQSize();

            // Check outbox backlog
            await this.checkOutboxBacklog();

            const duration = Date.now() - startTime;

            logWithContext("info", "[WebhookMonitoring] Monitoring completed", {
                durationMs: duration,
            });

            MetricsService.timing("webhook.monitoring.job.duration", duration);

        } catch (error: any) {
            logWithContext("error", "[WebhookMonitoring] Job failed", {
                error: error.message,
            });

            MetricsService.increment("webhook.monitoring.job.error", 1);
        }
    }

    //Check for webhooks with high failure rates
    private static async checkFailureRates(since: Date) {
        const webhooks = await prisma.webhook.findMany({
            where: { isActive: true },
            include: {
                deliveries: {
                    where: { createdAt: { gte: since } },
                },
            },
        });

        for (const webhook of webhooks) {
            const total = webhook.deliveries.length;
            if (total < 10) continue; // Skip if too few deliveries

            const failed = webhook.deliveries.filter(
                (d) => d.status === "FAILED"
            ).length;

            const failureRate = (failed / total) * 100;

            if (failureRate > 50) {
                await prisma.adminAlert.create({
                    data: {
                        tenantUuid: webhook.tenantUuid,
                        type: "WEBHOOK_HIGH_FAILURE_RATE",
                        level: "WARNING",
                        priority: "MEDIUM",
                        title: "Webhook High Failure Rate",
                        message: `Webhook ${webhook.url} has ${failureRate.toFixed(1)}% failure rate in last 24h`,
                        metadata: {
                            webhookUuid: webhook.uuid,
                            url: webhook.url,
                            failureRate,
                            total,
                            failed,
                        },
                        status: "PENDING",
                    },
                });

                logWithContext("warn", "[WebhookMonitoring] High failure rate detected", {
                    webhookUuid: webhook.uuid,
                    failureRate,
                });
            }
        }
    }

    private static async checkStuckDeliveries() {
        const oneHourAgo = dayjs().subtract(1, "hour").toDate();

        const stuckCount = await prisma.webhookDelivery.count({
            where: {
                status: "SENDING",
                createdAt: { lt: oneHourAgo },
            },
        });

        if (stuckCount > 0) {
            // Reset stuck deliveries
            await prisma.webhookDelivery.updateMany({
                where: {
                    status: "SENDING",
                    createdAt: { lt: oneHourAgo },
                },
                data: {
                    status: "PENDING",
                    nextRetryAt: new Date(),
                },
            });

            logWithContext("warn", "[WebhookMonitoring] Reset stuck deliveries", {
                count: stuckCount,
            });

            MetricsService.gauge("webhook.stuck_deliveries", stuckCount);
        };
    }

    private static async checkDLQSize() {
        const dlqCount = await prisma.webhookDeadLetter.count({
            where: { status: "FAILED" },
        });

        MetricsService.gauge("webhook.dlq.size", dlqCount);

        if (dlqCount > 100) {
            await prisma.adminAlert.create({
                data: {
                    tenantUuid: "SYSTEM",
                    type: "WEBHOOK_DLQ_SIZE",
                    level: "WARNING",
                    priority: "MEDIUM",
                    title: "Webhook DLQ Growing",
                    message: `Dead letter queue has ${dlqCount} failed webhooks`,
                    metadata: { dlqCount },
                    status: "PENDING",
                },
            });
        };
    }

    private static async checkOutboxBacklog() {
        const backlogCount = await prisma.webhookOutbox.count({
            where: { status: "PENDING" },
        });

        MetricsService.gauge("webhook.outbox.backlog", backlogCount);

        if (backlogCount > 1000) {
            await prisma.adminAlert.create({
                data: {
                    tenantUuid: "SYSTEM",
                    type: "WEBHOOK_OUTBOX_BACKLOG",
                    level: "WARNING",
                    priority: "HIGH",
                    title: "Webhook Outbox Backlog",
                    message: `Outbox has ${backlogCount} pending items`,
                    metadata: { backlogCount },
                    status: "PENDING",
                },
            });
        };
    }
}
