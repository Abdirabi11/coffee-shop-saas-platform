import crypto from "crypto";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { sendOutboundRequest, validateOutboundUrl } from "../../infrastructure/http/safeOutboundRequest.ts";

// The signing secret is shown once, when created or rotated; never on reads
const PUBLIC_FIELDS = { secret: true, secretHash: true } as const;
const hashSecret = (secret: string) => crypto.createHash("sha256").update(secret).digest("hex");

export class WebhookManagementService{
    static async createWebhook(input: {
        tenantUuid: string;
        storeUuid?: string;
        name?: string;
        url: string;
        events: string[];
        description?: string;
        ipWhitelist?: string[];
        headers?: Record<string, string>;
        createdBy: string;
    }) {
        try {
            const parsed = await validateOutboundUrl(input.url);

            if (input.storeUuid) {
                const store = await prisma.store.findFirst({
                    where: { uuid: input.storeUuid, tenantUuid: input.tenantUuid },
                    select: { uuid: true },
                });
                if (!store) throw new Error("STORE_NOT_FOUND");
            }

            // Generate secret
            const secret = this.generateSecret();

            const webhook = await prisma.webhook.create({
                data: {
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    name: input.name || `${parsed.hostname}-${crypto.randomBytes(3).toString("hex")}`,
                    url: input.url,
                    secret,
                    secretHash: hashSecret(secret),
                    eventTypes: input.events as any,
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

    // The webhook if it belongs to the tenant; throws WEBHOOK_NOT_FOUND
    private static async findOwned(tenantUuid: string, webhookUuid: string) {
        const webhook = await prisma.webhook.findFirst({
            where: { uuid: webhookUuid, tenantUuid },
        });
        if (!webhook) throw new Error("WEBHOOK_NOT_FOUND");
        return webhook;
    }

    static async listWebhooks(tenantUuid: string, storeUuid?: string) {
        return prisma.webhook.findMany({
            where: { tenantUuid, ...(storeUuid && { storeUuid }) },
            omit: PUBLIC_FIELDS,
            orderBy: { createdAt: "desc" },
        });
    }

    static async getWebhook(tenantUuid: string, webhookUuid: string) {
        const webhook = await prisma.webhook.findFirst({
            where: { uuid: webhookUuid, tenantUuid },
            omit: PUBLIC_FIELDS,
        });
        if (!webhook) throw new Error("WEBHOOK_NOT_FOUND");
        return webhook;
    }

    static async updateWebhook(input: {
        tenantUuid: string;
        webhookUuid: string;
        url?: string;
        events?: string[];
        description?: string;
        isActive?: boolean;
        ipWhitelist?: string[];
        headers?: Record<string, string>;
    }) {
        await this.findOwned(input.tenantUuid, input.webhookUuid);

        if (input.url) {
            await validateOutboundUrl(input.url);
        }

        const webhook = await prisma.webhook.update({
            where: { uuid: input.webhookUuid },
            data: {
                url: input.url,
                eventTypes: input.events as any,
                description: input.description,
                isActive: input.isActive,
                ipWhitelist: input.ipWhitelist,
                headers: input.headers,
            },
            omit: PUBLIC_FIELDS,
        });

        logWithContext("info", "[Webhook] Webhook updated", {
            webhookUuid: input.webhookUuid,
        });

        return webhook;
    }

    static async deleteWebhook(tenantUuid: string, webhookUuid: string) {
        const { count } = await prisma.webhook.deleteMany({
            where: { uuid: webhookUuid, tenantUuid },
        });
        if (count === 0) throw new Error("WEBHOOK_NOT_FOUND");

        logWithContext("info", "[Webhook] Webhook deleted", {
            webhookUuid,
        });

        MetricsService.increment("webhook.deleted", 1);
    }

    static async rotateSecret(tenantUuid: string, webhookUuid: string) {
        await this.findOwned(tenantUuid, webhookUuid);
        const secret = this.generateSecret();

        const webhook = await prisma.webhook.update({
            where: { uuid: webhookUuid },
            data: { secret, secretHash: hashSecret(secret) },
        });

        logWithContext("info", "[Webhook] Secret rotated", {
            webhookUuid,
        });

        return {
            ...webhook,
            secretPreview: `${secret.substring(0, 8)}...`,
        };
    }

    static async testWebhook(tenantUuid: string, webhookUuid: string) {
        const webhook = await this.findOwned(tenantUuid, webhookUuid);

        const testPayload = {
            eventType: "webhook.test",
            eventUuid: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            data: {
                message: "This is a test webhook",
            },
        };

        try {
            // Private, loopback and metadata addresses are refused at connect
            // time; redirects are not followed
            const body = JSON.stringify(testPayload);
            const response = await sendOutboundRequest({
                url: webhook.url,
                headers: {
                    ...webhook.headers as any,
                    "Content-Type": "application/json",
                    "X-Webhook-Signature": this.signPayload(testPayload, webhook.secret),
                    "X-Webhook-Id": webhook.uuid,
                },
                body,
                timeoutMs: 10000,
                maxResponseBytes: 1000,
            });

            return {
                success: response.ok,
                status: response.status,
                duration: response.durationMs,
                response: response.body,
            };

        } catch (error: any) {
            return {
                success: false,
                error: error.message,
            };
        }
    }


    static async getDeliveries(input: {
        tenantUuid: string;
        webhookUuid: string;
        status?: string;
        page?: number;
        limit?: number;
    }) {
        await this.findOwned(input.tenantUuid, input.webhookUuid);

        const page = input.page || 1;
        const limit = input.limit || 50;
        const skip = (page - 1) * limit;

        const where: any = {
            webhookUuid: input.webhookUuid,
            tenantUuid: input.tenantUuid,
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

    static async getStatistics(tenantUuid: string, webhookUuid: string, days: number = 7) {
        await this.findOwned(tenantUuid, webhookUuid);
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
                    status: "SUCCEEDED",
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
                status: "SUCCEEDED",
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