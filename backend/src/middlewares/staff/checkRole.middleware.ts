import type { Request, Response, NextFunction } from "express";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";


//Check if user has specific role at store
export function checkStoreRole(allowedRoles: string[]) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userUuid = req.user?.uuid;
            const storeUuid = req.body.storeUuid || req.query.storeUuid || req.params.storeUuid;

            if (!userUuid || !storeUuid) {
                return res.status(401).json({
                    error: "UNAUTHORIZED",
                    message: "Authentication required",
                });
            }

            const userStore = await prisma.userStore.findUnique({
                where: {
                    userUuid_storeUuid: {
                        userUuid,
                        storeUuid,
                    },
                },
            });

            if (!userStore || !userStore.isActive) {
                return res.status(403).json({
                    error: "FORBIDDEN",
                    message: "No access to this store",
                });
            }

            if (!allowedRoles.includes(userStore.role)) {
                logWithContext("warn", "[Role] Access denied", {
                    userUuid,
                    storeUuid,
                    userRole: userStore.role,
                    requiredRoles: allowedRoles,
                });

                return res.status(403).json({
                    error: "FORBIDDEN",
                    message: "Insufficient role",
                });
            }

            // Attach role to request for use in controller
            req.staffRole = userStore.role;

            next();

        } catch (error: any) {
            logWithContext("error", "[Role] Check failed", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    };
}