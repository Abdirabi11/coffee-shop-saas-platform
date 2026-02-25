import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma.ts"
import { logWithContext } from "../infrastructure/observability/logger.ts";

const AUDITABLE_ACTIONS = [
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
];
  
const SENSITIVE_ROUTES = [
    "/api/orders",
    "/api/payments",
    "/api/refunds",
    "/api/users",
    "/api/products",
    "/api/categories",
];

export const auditLogMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    // Only audit certain actions
    if (!AUDITABLE_ACTIONS.includes(req.method)) {
        return next();
    }
  
    // Only audit sensitive routes
    const isSensitive = SENSITIVE_ROUTES.some((route) =>
        req.path.startsWith(route)
    );
  
    if (!isSensitive) {
      return next();
    }
  
    // Capture response
    const originalJson = res.json.bind(res);
  
    res.json = function (body: any) {
        // Log after response
        setImmediate(async () => {
            try {
                await prisma.auditLog.create({
                    data: {
                        tenantUuid: req.tenant?.uuid || "SYSTEM",
                        userUuid: req.user?.uuid,
                        action: `${req.method} ${req.path}`,
                        entityType: extractEntityType(req.path),
                        entityUuid: extractEntityUuid(req),
                        requestBody: sanitizeForAudit(req.body),
                        responseBody: sanitizeForAudit(body),
                        statusCode: res.statusCode,
                        ipAddress: req.ip,
                        userAgent: req.headers["user-agent"],
                        deviceId: req.headers["x-device-id"] as string,
                    },
                });
            } catch (error: any) {
                logWithContext("error", "[AuditLog] Failed to create audit log", {
                    error: error.message,
                });
            }
        });
  
        return originalJson(body);
    };
  
    next();
};
  
  function extractEntityType(path: string): string {
    const match = path.match(/\/api\/([^\/]+)/);
    return match ? match[1].toUpperCase() : "UNKNOWN";
};
  
function extractEntityUuid(req: Request): string | undefined {
    return req.params.uuid || req.params.orderUuid || req.params.productUuid;
};
  
function sanitizeForAudit(data: any): any {
    if (!data) return null;
  
    // Remove sensitive fields
    const sanitized = { ...data };
    delete sanitized.password;
    delete sanitized.token;
    delete sanitized.secret;
    delete sanitized.apiKey;
  
    return sanitized;
};
  