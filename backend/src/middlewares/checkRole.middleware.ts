import type { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma.ts"


/**
 * Checks the user's store-specific role from UserStore.
 * Expects `authenticate` middleware to have run first (req.user.userUuid).
 * Pulls storeUuid from req.params.storeUuid || req.body.storeUuid.
 *
 * Usage: checkRole(["CASHIER", "MANAGER", "ADMIN"])
 */
export const checkRole = (allowedRoles: string[]) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userUuid = req.user?.userUuid;

            if (!userUuid) {
                return res.status(401).json({
                    error: "UNAUTHORIZED",
                    message: "Authentication required",
                });
            }

            const storeUuid =
                req.params.storeUuid || req.body.storeUuid || req.query.storeUuid;

            if (!storeUuid) {
                return res.status(400).json({
                    error: "MISSING_STORE_CONTEXT",
                    message: "Store UUID is required for role verification",
                });
            }

            // Check global role first — SUPER_ADMIN bypasses all store-level checks
            const user = await prisma.user.findUnique({
                where: { uuid: userUuid },
                select: { globalRole: true },
            });

            if (!user) {
                return res.status(404).json({
                    error: "USER_NOT_FOUND",
                    message: "User not found",
                });
            }

            if (user.globalRole === "SUPER_ADMIN") {
                return next();
            }

        // Look up store-specific role
        const userStore = await prisma.userStore.findUnique({
            where: {
                userUuid_storeUuid: { userUuid, storeUuid },
            },
            select: { role: true, isActive: true },
        });

            if (!userStore || !userStore.isActive) {
                return res.status(403).json({
                    error: "NO_STORE_ACCESS",
                    message: "You do not have access to this store",
                });
            }

            if (!allowedRoles.includes(userStore.role)) {
                return res.status(403).json({
                    error: "INSUFFICIENT_ROLE",
                    message: `Required role: ${allowedRoles.join(" or ")}. Your role: ${userStore.role}`,
                });
            }

            // Attach store role to request for downstream use
            req.storeRole = userStore.role;

            next();
        } catch (error) {
            console.error("[checkRole] Error:", error);
            return res.status(500).json({
                error: "INTERNAL_ERROR",
                message: "Role verification failed",
            });
        }
    };
};