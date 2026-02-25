import { Request, Response } from "express";
import { prisma } from "../../config/prisma.ts"
import { redis } from "../../lib/redis.ts";


export class OrderHealthController {
    //GET /health/orders
    //Health check for order system
    static async check(req: Request, res: Response){
        const checks = {
            database: false,
            redis: false,
            pendingOrders: 0,
            stuckOrders: 0,
            status: "healthy",
        };

        try {
             // Check database
            await prisma.$queryRaw`SELECT 1`;
            checks.database = true;

            // Check Redis
            await redis.ping();
            checks.redis = true;

            // Check pending orders count
            checks.pendingOrders = await prisma.order.count({
                where: {
                    status: { in: ["PENDING", "PAYMENT_PENDING"] },
                },
            });

            // Check stuck orders (older than 30 minutes)
            const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
            checks.stuckOrders = await prisma.order.count({
                where: {
                    status: "PAID",
                    updatedAt: { lt: thirtyMinutesAgo },
                },
            });

            // Determine overall status
            if (!checks.database || !checks.redis) {
                checks.status = "unhealthy";
                return res.status(503).json(checks);
            }

            if (checks.stuckOrders > 10) {
                checks.status = "degraded";
                return res.status(200).json(checks);
            }

            return res.status(200).json(checks);
        } catch (error: any) {
            checks.status = "unhealthy";
            return res.status(503).json({
                ...checks,
                error: error.message,
            });
        }
    }
}