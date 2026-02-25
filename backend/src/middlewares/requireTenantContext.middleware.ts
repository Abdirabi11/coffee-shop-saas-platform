import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma.ts"
import { logWithContext } from "../infrastructure/observability/logger.ts";

//Middleware to ensure tenant context is present
//Extracts tenant from authenticated user
export const requireTenantContext = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        // Check if user is authenticated
        if (!req.user?.uuid) {
            return res.status(401).json({
                error: "UNAUTHORIZED",
                message: "Authentication required",
            });
        }

        // Get tenant from user's TenantUser relationship
        const tenantUser = await prisma.tenantUser.findFirst({
            where: {
                userUuid: req.user.uuid,
                isActive: true,
            },
            include: {
                tenant: true,
            },
        });

        if (!tenantUser || !tenantUser.tenant) {
            logWithContext("warn", "[TenantContext] User has no active tenant", {
                userUuid: req.user.uuid,
            });

            return res.status(403).json({
                error: "NO_TENANT_ACCESS",
                message: "You don't have access to any tenant",
            });
        };

        // Check if tenant is active
        if (!tenantUser.tenant.isActive) {
            return res.status(403).json({
                error: "TENANT_SUSPENDED",
                message: "Your organization account is suspended",
            });
        };

        // Attach tenant and tenantUser to request
        req.tenant = tenantUser.tenant;
        req.tenantUser = tenantUser;

        // Also attach for convenience
        req.user.tenantUserUuid = tenantUser.uuid;
        req.user.role = tenantUser.role;

        logWithContext("debug", "[TenantContext] Tenant context attached", {
            userUuid: req.user.uuid,
            tenantUuid: tenantUser.tenantUuid,
            role: tenantUser.role,
        });

        next();
    } catch (error: any) {
        logWithContext("error", "[TenantContext] Failed to attach tenant context", {
            error: error.message,
            userUuid: req.user?.uuid,
        });

        return res.status(500).json({
            error: "INTERNAL_SERVER_ERROR",
            message: "Failed to load tenant context",
        });
    }
};

//Middleware to allow optional tenant context
//For public/semi-public endpoints
export const optionalTenantContext = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        if (!req.user?.uuid) {
            return next();
        };

        const tenantUser = await prisma.tenantUser.findFirst({
            where: {
                userUuid: req.user.uuid,
                isActive: true,
            },
            include: {
                tenant: true,
            },
        });

        if (tenantUser && tenantUser.tenant) {
            req.tenant = tenantUser.tenant;
            req.tenantUser = tenantUser;
            req.user.tenantUserUuid = tenantUser.uuid;
            req.user.role = tenantUser.role;
        };

        next();
    } catch (error: any) {
        logWithContext("error", "[TenantContext] Failed to attach optional context", {
            error: error.message,
        });

        // Don't fail, just continue
        next();
    }
};
