import crypto from "crypto";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";

export class WebhookManagementService{
    static async createWebhook(input: {
        tenantUuid: string;
        storeUuid?: string;
        url: string;
        events: string[];
        description?: string;
        ipWhitelist?: string[];
        headers?: Record<string, string>;
        createdBy: string;
    }) {
        try {
            this.validateWebhookUrl(input.url);

            // Generate secret
            const secret = this.generateSecret();

            const webhook = await prisma.webhook.create({
                data: {
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    url: input.url,
                    secret,
                    events: input.events,
                    description: input.description,
                    ipWhitelist: input.ipWhitelist || [],
                    headers: input.headers,
                    createdBy: input.createdBy,
                },
            });

            logWithContext("info", "[Webhook] Webhook created", {
                webhookUuid: webhook.uuid,
                url: input.url,
                events: input.events,
            });

            MetricsService.increment("webhook.created", 1);

            return {
                ...webhook,
                secretPreview: `${secret.substring(0, 8)}...`,
            };

        } catch (error: any) {
            logWithContext("error", "[Webhook] Failed to create webhook", {
                error: error.message,
            });
            throw error;
        }
    }

    static async updateWebhook(input: {
        webhookUuid: string;
        url?: string;
        events?: string[];
        description?: string;
        isActive?: boolean;
        ipWhitelist?: string[];
        headers?: Record<string, string>;
    }) {
        if (input.url) {
            this.validateWebhookUrl(input.url);
        }

        const webhook = await prisma.webhook.update({
            where: { uuid: input.webhookUuid },
            data: {
                url: input.url,
                events: input.events,
                description: input.description,
                isActive: input.isActive,
                ipWhitelist: input.ipWhitelist,
                headers: input.headers,
            },
        });

        logWithContext("info", "[Webhook] Webhook updated", {
            webhookUuid: input.webhookUuid,
        });

        return webhook;
    }

    static async deleteWebhook(webhookUuid: string) {
        await prisma.webhook.delete({
            where: { uuid: webhookUuid },
        });

        logWithContext("info", "[Webhook] Webhook deleted", {
            webhookUuid,
        });

        MetricsService.increment("webhook.deleted", 1);
    }

    static async rotateSecret(webhookUuid: string) {
        const secret = this.generateSecret();

        const webhook = await prisma.webhook.update({
            where: { uuid: webhookUuid },
            data: { secret },
        });

        logWithContext("info", "[Webhook] Secret rotated", {
            webhookUuid,
        });

        return {
            ...webhook,
            secretPreview: `${secret.substring(0, 8)}...`,
        };
    }

    static async testWebhook(webhookUuid: string) {
        const webhook = await prisma.webhook.findUnique({
            where: { uuid: webhookUuid },
        });

        if (!webhook) {
            throw new Error("WEBHOOK_NOT_FOUND");
        }

        const testPayload = {
            eventType: "webhook.test",
            eventUuid: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            data: {
                message: "This is a test webhook",
            },
        };

        try {
            const startTime = Date.now();

            const response = await fetch(webhook.url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Webhook-Signature": this.signPayload(testPayload, webhook.secret),
                    "X-Webhook-Id": webhook.uuid,
                    ...webhook.headers as any,
                },
                body: JSON.stringify(testPayload),
                signal: AbortSignal.timeout(10000), // 10 second timeout
            });

            const duration = Date.now() - startTime;

            return {
                success: response.ok,
                status: response.status,
                duration,
                response: await response.text().catch(() => null),
            };

        } catch (error: any) {
            return {
                success: false,
                error: error.message,
            };
        }
    }


    static async getDeliveries(input: {
        webhookUuid: string;
        status?: string;
        page?: number;
        limit?: number;
    }) {
        const page = input.page || 1;
        const limit = input.limit || 50;
        const skip = (page - 1) * limit;

        const where: any = {
            webhookUuid: input.webhookUuid,
        };

        if (input.status) {
            where.status = input.status;
        };

        const [deliveries, total] = await Promise.all([
            prisma.webhookDelivery.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
            }),
            prisma.webhookDelivery.count({ where }),
        ]);

        return {
            data: deliveries,
            meta: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    }

    static async getStatistics(webhookUuid: string, days: number = 7) {
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const [total, success, failed, pending] = await Promise.all([
            prisma.webhookDelivery.count({
                where: {
                    webhookUuid,
                    createdAt: { gte: since },
                },
            }),
            prisma.webhookDelivery.count({
                where: {
                    webhookUuid,
                    status: "SUCCESS",
                    createdAt: { gte: since },
                },
            }),
            prisma.webhookDelivery.count({
                where: {
                    webhookUuid,
                    status: "FAILED",
                    createdAt: { gte: since },
                },
            }),
            prisma.webhookDelivery.count({
                where: {
                    webhookUuid,
                    status: { in: ["PENDING", "SENDING"] },
                },
            }),
        ]);

        const avgDuration = await prisma.webhookDelivery.aggregate({
            where: {
                webhookUuid,
                status: "SUCCESS",
                createdAt: { gte: since },
                duration: { not: null },
            },
            _avg: { duration: true },
        });

        const successRate = total > 0 ? (success / total) * 100 : 0;

        return {
            total,
            success,
            failed,
            pending,
            successRate: Number(successRate.toFixed(2)),
            avgDuration: avgDuration._avg.duration || 0,
        };
    }

    private static validateWebhookUrl(url: string) {
        try {
            const parsed = new URL(url);

            // Must be HTTPS in production
            if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
                throw new Error("Webhook URL must use HTTPS");
            };

            // Block localhost/private IPs in production
            if (process.env.NODE_ENV === "production") {
                const hostname = parsed.hostname;
                if (
                    hostname === "localhost" ||
                    hostname.startsWith("127.") ||
                    hostname.startsWith("192.168.") ||
                    hostname.startsWith("10.") ||
                    hostname.startsWith("172.")
                ) {
                    throw new Error("Cannot use private IP addresses");
                }
            };

        } catch (error: any) {
            throw new Error(`Invalid webhook URL: ${error.message}`);
        }
    }

    private static generateSecret(): string {
        return crypto.randomBytes(32).toString("hex");
    }

    private static signPayload(payload: any, secret: string): string {
        return crypto
            .createHmac("sha256", secret)
            .update(JSON.stringify(payload))
            .digest("hex");
    }
}