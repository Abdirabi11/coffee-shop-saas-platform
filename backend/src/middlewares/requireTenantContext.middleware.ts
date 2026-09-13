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

        // 1. Explicit header, if present. 2. Otherwise the tenantUuid already
        // verified into this user's JWT at login (Token.service.ts). Both are
        // checked the same way: an active tenantUser row must exist for this
        // exact (userUuid, tenantUuid) pair, on an ACTIVE tenant.
        const headerTenantUuid = req.headers["x-tenant-uuid"] as string;
        const claimedTenantUuid = headerTenantUuid || user.tenantUuid;

        if (claimedTenantUuid) {
            const tenantUser = await prisma.tenantUser.findFirst({
                where: {
                    userUuid: user.userUuid,
                    tenantUuid: claimedTenantUuid,
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

        // 3. No header and no tenantUuid on the token: only safe to fall back
        // if the user has exactly one active membership. Fetching up to 2 is
        // enough to detect ambiguity without counting the whole set.
        const tenantUsers = await prisma.tenantUser.findMany({
            where: {
                userUuid: user.userUuid,
                isActive: true,
            },
            include: { tenant: true },
            take: 2,
        });

        if (tenantUsers.length === 0) {
            return res.status(403).json({ success: false, error: "NO_TENANT_ACCESS" });
        }

        if (tenantUsers.length > 1) {
            return res.status(400).json({
                success: false,
                error: "TENANT_CONTEXT_REQUIRED",
                message: "Multiple tenant memberships found for this user; send x-tenant-uuid to specify which tenant.",
            });
        }

        const [tenantUser] = tenantUsers;

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