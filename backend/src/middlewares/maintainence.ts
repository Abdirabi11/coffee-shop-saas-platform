import type { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma.ts";
import { verifyAccessToken } from "../utils/jwt.ts";
import { logWithContext } from "../infrastructure/observability/Logger.ts";
import { PlatformSettingsService } from "../services/superAdmin/PlatformSettings.service.ts";

// Sign-in has to keep working so a super admin can get a token, and the
// platform router so they can switch maintenance off again. Payment
// provider webhooks stay open so settled payments aren't left hanging.
const ALWAYS_OPEN = ["/api/auth/", "/api/admin/platform/", "/api/payments/webhooks/"];

// A valid access token of a (not banned) SUPER_ADMIN, checked against the
// DB as authenticate does. Only runs while maintenance is on.
async function isSuperAdmin(req: Request): Promise<boolean> {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return false;
    try {
        const payload = verifyAccessToken(header.slice(7));
        const user = await prisma.user.findUnique({
            where: { uuid: payload.userUuid },
            select: { globalRole: true, isBanned: true, tokenVersion: true },
        });
        return !!user && !user.isBanned && user.tokenVersion === payload.tokenVersion && user.globalRole === "SUPER_ADMIN";
    } catch {
        return false;
    }
}

export const maintenanceGuard = async (req: Request, res: Response, next: NextFunction) => {
    let state;
    try {
        state = await PlatformSettingsService.getMaintenance();
    } catch (error: any) {
        // Can't read the setting: fail open rather than take the API down
        logWithContext("error", "[Maintenance] Could not read maintenance state", { error: error.message });
        return next();
    }
    if (!state.enabled) return next();

    if (ALWAYS_OPEN.some((prefix) => req.path.startsWith(prefix)) || (await isSuperAdmin(req))) {
        return next();
    }

    res.setHeader("Retry-After", "300");
    return res.status(503).json({
        success: false,
        error: "MAINTENANCE_MODE",
        message: state.message || "Service under maintenance",
    });
};
