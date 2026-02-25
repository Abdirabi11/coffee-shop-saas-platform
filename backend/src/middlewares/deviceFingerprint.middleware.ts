import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { logWithContext } from "../infrastructure/observability/logger.ts";
import prisma from "../config/prisma.ts"

export const deviceFingerprintMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const deviceId = req.headers["x-device-id"] as string;
        const userAgent = req.headers["user-agent"] as string;
        const ip = req.ip;
    
        if (!deviceId) {
            // Generate device fingerprint
            const fingerprint = crypto
                .createHash("sha256")
                .update(`${userAgent}-${ip}-${Date.now()}`)
                .digest("hex");
    
            req.deviceId = fingerprint;
            return next();
        }
  
        // Verify device exists and is trusted
        const device = await prisma.userDevice.findFirst({
            where: {
                deviceId,
                isActive: true,
            },
        });
  
        if (!device) {
            logWithContext("warn", "[Device] Unknown device detected", {
                deviceId,
                ip,
                userAgent,
            });
    
            // Allow but flag for review
            req.deviceTrusted = false;
        } else {
            req.deviceTrusted = true;
    
            // Update last seen
            await prisma.userDevice.update({
                where: { uuid: device.uuid },
                data: { lastSeenAt: new Date() },
            });
        }
    
        req.deviceId = deviceId;
        next();
    } catch (error: any) {
        logWithContext("error", "[Device] Fingerprint check failed", {
            error: error.message,
        });
    
        // Don't block request
        next();
    }
};