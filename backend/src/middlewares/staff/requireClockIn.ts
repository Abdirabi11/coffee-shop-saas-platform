import { Request, Response, NextFunction } from "express";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import prisma from "../../config/prisma.ts"


//Warn if user is not clocked in (but don't block)
export async function warnIfNotClockedIn(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const userUuid = req.user?.uuid;
        const storeUuid = req.body.storeUuid || req.query.storeUuid;

        if (!userUuid || !storeUuid) {
            return next();
        }

        const activeTimeEntry = await prisma.timeEntry.findFirst({
            where: {
                userUuid,
                storeUuid,
                clockOutAt: null,
            },
        });

        if (!activeTimeEntry) {
            // Add warning to response (controller can check this)
            req.clockInWarning = true;

            logWithContext("warn", "[ClockIn] User not clocked in", {
                userUuid,
                storeUuid,
                action: req.path,
            });
        }

        next();

    } catch (error: any) {
        // Don't block on errors, just log
        logWithContext("error", "[ClockIn] Check failed", {
            error: error.message,
        });
        next();
    }
}