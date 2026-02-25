import type { Request, Response, NextFunction } from "express";

export const ensureTenantIsolation = (req: Request, res: Response, next: NextFunction) => {
    // Ensure all queries are scoped to tenant
    if (!req.tenant?.uuid) {
      return res.status(403).json({
        error: "TENANT_CONTEXT_REQUIRED",
        message: "Tenant context is required for this operation",
      });
    }
  
    // Add tenant filter to all Prisma queries
    req.prismaFilter = {
      tenantUuid: req.tenant.uuid,
    };
  
    next();
};