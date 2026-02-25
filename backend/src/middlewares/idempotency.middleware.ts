import type { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma.ts"
import { logWithContext } from "../infrastructure/observability/logger.ts";

export const idempotencyMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
 ) => {
    const key = req.headers["idempotency-key"] as string;

    if (!key) {
        return res.status(400).json({
            error: "IDEMPOTENCY_KEY_REQUIRED",
            message: "Idempotency-Key header required for this operation",
        });
    };

    const tenantUuid = req.tenant?.uuid;

    if (!tenantUuid) {
        return res.status(400).json({
            error: "TENANT_REQUIRED",
            message: "Tenant context required for idempotency",
        });
    };

    const route = req.method + " " + req.originalUrl;

    try {
        // Check if key already exists
        const existing = await prisma.idempotencyKey.findUnique({
            where: {
                tenantUuid_key_route: {
                    tenantUuid,
                    key,
                    route,
                },
            },
        });
    
        if (existing) {
            // Return cached response
            logWithContext("info", "[Idempotency] Returning cached response", {
                key,
                route,
            });
        
            return res.status(existing.statusCode).json(existing.response);
        };
    
        // Capture response
        const originalJson = res.json.bind(res);
    
        res.json = async function (body: any) {
            // Store idempotency key
            try {
                await prisma.idempotencyKey.create({
                    data: {
                        tenantUuid,
                        key,
                        route,
                        response: body,
                        statusCode: res.statusCode,
                        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
                    },
                });
    
                logWithContext("info", "[Idempotency] Stored idempotency key", {
                    key,
                    route,
                });
            } catch (error: any) {
                logWithContext("error", "[Idempotency] Failed to store key", {
                    error: error.message,
                });
            }
    
            return originalJson(body);
        };
    
        next();
    } catch (error: any) {
        logWithContext("error", "[Idempotency] Middleware error", {
            error: error.message,
        });
    
        return res.status(500).json({
            error: "INTERNAL_SERVER_ERROR",
            message: "Idempotency check failed",
        });
    }
};

// Endpoint	Required
// /payments/confirm	✅
// /refunds	✅
// /retry-payment	✅
// Webhooks	✅