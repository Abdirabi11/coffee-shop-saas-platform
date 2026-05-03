import type { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma.ts"
import { logWithContext } from "../infrastructure/observability/Logger.ts";

export const requireTenantContext = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const user = (req as any).user;
        if (!user?.userUuid) {
            return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
        }
 
        // 1. Try explicit header first
        const headerTenantUuid = req.headers["x-tenant-uuid"] as string;
 
        if (headerTenantUuid) {
            // Verify user has access to this tenant
            const tenantUser = await prisma.tenantUser.findFirst({
                where: {
                    userUuid: user.userUuid,
                    tenantUuid: headerTenantUuid,
                    isActive: true,
                },
                include: { tenant: true },
            });
 
            if (!tenantUser) {
                return res.status(403).json({ success: false, error: "NO_TENANT_ACCESS" });
            }
 
            if (tenantUser.tenant.status !== "ACTIVE") {
                return res.status(403).json({ success: false, error: "TENANT_SUSPENDED" });
            }
 
            (req as any).tenant = tenantUser.tenant;
            (req as any).tenantUser = tenantUser;
            return next();
        }
 
        // 2. Fallback: look up user's tenant
        const tenantUser = await prisma.tenantUser.findFirst({
            where: {
                userUuid: user.userUuid,
                isActive: true,
            },
            include: { tenant: true },
        });
 
        if (!tenantUser || !tenantUser.tenant) {
            return res.status(403).json({ success: false, error: "NO_TENANT_ACCESS" });
        }
 
        if (tenantUser.tenant.status !== "ACTIVE") {
            return res.status(403).json({ success: false, error: "TENANT_SUSPENDED" });
        }
 
        (req as any).tenant = tenantUser.tenant;
        (req as any).tenantUser = tenantUser;
        next();
    } catch (error: any) {
        logWithContext("error", "[TenantContext] Failed", { error: error.message });
        return res.status(500).json({ success: false, error: "TENANT_CONTEXT_FAILED" });
    }
};
 
/**
 * Optional tenant context — for public/semi-public endpoints.
 * Attaches tenant if user is authenticated and has one, but doesn't fail if not.
 */
export const optionalTenantContext = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const user = (req as any).user;
        if (!user?.userUuid) return next();
 
        const headerTenantUuid = req.headers["x-tenant-uuid"] as string;
 
        const tenantUser = await prisma.tenantUser.findFirst({
            where: {
                userUuid: user.userUuid,
                ...(headerTenantUuid ? { tenantUuid: headerTenantUuid } : {}),
                isActive: true,
            },
            include: { tenant: true },
        });
 
        if (tenantUser?.tenant) {
            (req as any).tenant = tenantUser.tenant;
            (req as any).tenantUser = tenantUser;
        }
 
        next();
    } catch {
        next(); 
    }
};
