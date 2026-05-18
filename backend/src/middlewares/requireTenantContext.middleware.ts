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

        if (user.role === "SUPER_ADMIN") {
            const tenantUuid = 
                req.params.tenantUuid || 
                req.headers["x-tenant-uuid"] as string;

            if (tenantUuid) {
                const tenant = await prisma.tenant.findUnique({
                    where: { uuid: tenantUuid },
                });

                if (!tenant) {
                    return res.status(404).json({ success: false, error: "TENANT_NOT_FOUND" });
                }

                (req as any).tenant = tenant;
                (req as any).tenantUser = {
                    uuid: "SUPER_ADMIN",
                    userUuid: user.userUuid,
                    tenantUuid: tenant.uuid,
                    role: "TENANT_ADMIN",
                    isActive: true,
                    displayName: "Super Admin",
                };
                return next();
            }

            // No tenant specified — allow through for list endpoints
            (req as any).tenant = null;
            (req as any).tenantUser = null;
            return next();
        }

        // 1. Try explicit header first
        const headerTenantUuid = req.headers["x-tenant-uuid"] as string;

        if (headerTenantUuid) {
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