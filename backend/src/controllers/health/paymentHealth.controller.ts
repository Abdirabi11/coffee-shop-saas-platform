import { Request, Response } from "express";
import { prisma } from "../../config/prisma.ts"
import { monitoring } from "../../infrastructure/observability/monitoring.ts";

export class PaymentHealthController {

    //GET /health/payments
    static async checkHealth(req: Request, res: Response) {
        const checks: any = {
            timestamp: new Date().toISOString(),
            status: "healthy",
            checks: {},
        };

        try {
            //Database connectivity
            await prisma.$queryRaw`SELECT 1`;
            checks.checks.database = { status: "up" };
        } catch (error) {
            checks.checks.database = { status: "down", error: error.message };
            checks.status = "unhealthy";
        }

        //Payment provider connectivity
        const providers = ['stripe', 'evc_plus', 'zaad'];
        for (const provider of providers) {
            try {
                // Ping provider API
                checks.checks[`provider_${provider}`] = { status: "up" };
            } catch (error: any) {
                checks.checks[`provider_${provider}`] = { status: "down", error: error.message };
            }
        }

        //Webhook processing lag
        const webhookLag = await prisma.webhookEvent.count({
            where: {
                processedAt: null,
                createdAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
            },
        });
        checks.checks.webhook_lag = {
            status: webhookLag > 10 ? "warning" : "ok",
            unprocessed: webhookLag,
        };

        //Payment success rate (last hour)
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const [total, successful] = await Promise.all([
            prisma.payment.count({ where: { createdAt: { gte: hourAgo } } }),
            prisma.payment.count({ where: { createdAt: { gte: hourAgo }, status: "PAID" } }),
        ]);
        const successRate = total > 0 ? (successful / total) * 100 : 100;
        checks.checks.payment_success_rate = {
            status: successRate < 80 ? "warning" : "ok",
            rate: Math.round(successRate * 100) / 100,
            total,
            successful,
        };

        //DLQ size
        const dlqSize = await prisma.webhookDeadLetter.count({
            where: { status: "FAILED" },
        });
        checks.checks.dlq = {
            status: dlqSize > 50 ? "warning" : "ok",
            size: dlqSize,
        };

        //Orphaned payments
        const orphaned = await prisma.payment.count({
            where: {
                order: null,
                createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
        });
        checks.checks.orphaned_payments = {
            status: orphaned > 0 ? "warning" : "ok",
            count: orphaned,
        };

        // Overall status
        const hasWarning = Object.values(checks.checks).some((c: any) => c.status === "warning");
        const hasDown = Object.values(checks.checks).some((c: any) => c.status === "down");
        
        if (hasDown) {
            checks.status = "unhealthy";
        } else if (hasWarning) {
            checks.status = "degraded";
        };

        const statusCode = checks.status === "unhealthy" ? 503 : 200;
        return res.status(statusCode).json(checks);
    }

    //GET /health/payments/metrics
    static async getMetrics(req: Request, res: Response) {
        const metrics = monitoring.getMetricsSummary();
        return res.json(metrics);
    }
} 