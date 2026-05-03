import type { Request, Response, NextFunction } from "express";

export function requireTenantHeader(
    req: Request,
    res: Response,
    next: NextFunction
) {
    const tenantUuid = req.headers["x-tenant-id"] as string;

    if (!tenantUuid) {
        return res.status(400).json({
            error: "TENANT_REQUIRED",
            message: "x-tenant-id header is required",
        });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (!uuidRegex.test(tenantUuid)) {
        return res.status(400).json({
            error: "INVALID_TENANT_ID",
            message: "x-tenant-id must be a valid UUID",
        });
    }

    // Attach to request for downstream use
    req.tenantUuid = tenantUuid;

    next();
}