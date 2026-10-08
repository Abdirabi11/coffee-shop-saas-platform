import type { Request, Response, NextFunction } from "express";
import { PermissionManagementService } from "../../services/staff/PermissionManagement.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import {
    ensureTenantContext,
    findStoreInTenant,
    storeFromRequest,
    type StoreResolver,
} from "../auth.middleware.ts";

// Store-scoped permission check: the user must hold the permission at the
// store, and the store must belong to the verified tenant (404 otherwise).
//
// The store comes from storeFrom when given: for routes that act on one
// record (a product, a category, an option group), pass a resolver for that
// record's own store, e.g. checkPermission("menu.update",
// storeOf.record("product", "productUuid")). Otherwise it is the storeUuid the
// request names (param, query, body) - only correct when the handler acts on
// that same store; on create routes run validateRequest first so this is the
// validated storeUuid the handler will use.
function permissionMiddleware(permissionSlugs: string[], storeFrom?: StoreResolver) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userUuid = req.user?.userUuid;

            if (!userUuid) {
                return res.status(401).json({
                    error: "UNAUTHORIZED",
                    message: "Authentication required",
                });
            }

            // SUPER_ADMIN bypasses all permission checks (globalRole from the
            // DB, set by authenticate; not the token claim)
            if (req.user?.globalRole === "SUPER_ADMIN") {
                return next();
            }

            if (!(await ensureTenantContext(req, res))) return;
            if (!req.tenant) {
                return res.status(403).json({ error: "NO_TENANT_ACCESS", message: "Tenant context required" });
            }

            const resolved = await (storeFrom ?? storeFromRequest)(req);
            const storeUuid = typeof resolved === "string" && resolved ? resolved : undefined;

            if (!storeUuid) {
                // With a resolver, no store means the record isn't in this tenant
                return storeFrom
                    ? res.status(404).json({ error: "NOT_FOUND", message: "Resource not found" })
                    : res.status(400).json({ error: "VALIDATION_ERROR", message: "storeUuid is required" });
            }

            const store = await findStoreInTenant(req, storeUuid);
            if (!store) {
                return res.status(404).json({ error: "STORE_NOT_FOUND", message: "Store not found" });
            }
            req.store = store;

            for (const permissionSlug of permissionSlugs) {
                if (await PermissionManagementService.hasPermission({ userUuid, storeUuid, permissionSlug })) {
                    return next();
                }
            }

            logWithContext("warn", "[Permission] Access denied", {
                userUuid,
                storeUuid,
                permissions: permissionSlugs,
            });

            return res.status(403).json({
                error: "FORBIDDEN",
                message: permissionSlugs.length === 1
                    ? `You do not have permission: ${permissionSlugs[0]}`
                    : "Insufficient permissions",
            });
        } catch (error: any) {
            logWithContext("error", "[Permission] Check failed", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Permission check failed",
            });
        }
    };
}

export function checkPermission(permissionSlug: string, storeFrom?: StoreResolver) {
    return permissionMiddleware([permissionSlug], storeFrom);
}

export function checkAnyPermission(permissionSlugs: string[], storeFrom?: StoreResolver) {
    return permissionMiddleware(permissionSlugs, storeFrom);
}
