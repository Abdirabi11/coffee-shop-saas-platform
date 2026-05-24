import type { Request, Response, NextFunction } from "express";
import { PermissionManagementService } from "../../services/staff/PermissionManagement.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

export function checkPermission(permissionSlug: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userUuid = req.user?.userUuid;  // ← was req.user?.uuid
            const storeUuid = req.body?.storeUuid || req.query?.storeUuid || req.params?.storeUuid;


            if (!userUuid) {
                return res.status(401).json({
                    error: "UNAUTHORIZED",
                    message: "Authentication required",
                });
            }

            // SUPER_ADMIN bypasses all permission checks
            if (req.user?.role === "SUPER_ADMIN") {
                return next();
            }

            if (!storeUuid) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "storeUuid is required",
                });
            }

            const hasPermission = await PermissionManagementService.hasPermission({
                userUuid,
                storeUuid,
                permissionSlug,
            });

            if (!hasPermission) {
                logWithContext("warn", "[Permission] Access denied", {
                    userUuid,
                    storeUuid,
                    permission: permissionSlug,
                });

                return res.status(403).json({
                    error: "FORBIDDEN",
                    message: `You do not have permission: ${permissionSlug}`,
                });
            }

            next();
        } catch (error: any) {
            logWithContext("error", "[Permission] Check failed", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    };
}

export function checkAnyPermission(permissionSlugs: string[]) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userUuid = req.user?.userUuid;  // ← was req.user?.uuid
            const storeUuid = req.body?.storeUuid || req.query?.storeUuid || req.params?.storeUuid;

            if (!userUuid) {
                return res.status(401).json({
                    error: "UNAUTHORIZED",
                    message: "Authentication required",
                });
            }

            // SUPER_ADMIN bypasses all permission checks
            if (req.user?.role === "SUPER_ADMIN") {
                return next();
            }

            if (!storeUuid) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "storeUuid is required",
                });
            }

            for (const permissionSlug of permissionSlugs) {
                const hasPermission = await PermissionManagementService.hasPermission({
                    userUuid,
                    storeUuid,
                    permissionSlug,
                });

                if (hasPermission) {
                    return next();
                }
            }

            return res.status(403).json({
                error: "FORBIDDEN",
                message: "Insufficient permissions",
            });
        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    };
}