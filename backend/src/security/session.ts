import type { Request } from "express"
import prisma from "../config/prisma.ts"
import { generateDeviceFingerprint } from "./deviceFingerprint.ts";
import { getOrCreateDeviceId, getDeviceType } from "./deviceId.ts";


export const createSession = async (
    userUuid: string,
    refreshTokenUuid: string,
    req: Request,
    storeUuid: string
  ) => {
    const deviceId = getOrCreateDeviceId(req);
    const userAgent = req.headers["user-agent"] || "unknown";
    const deviceType = getDeviceType(userAgent);
    const fingerprint = generateDeviceFingerprint(req);

    const ipAddress =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
        req.socket.remoteAddress ||
        "unknown";

    await prisma.session.create({
        data: {
         userUuid,
         refreshTokenUuid,
         storeUuid,
         deviceId,
         deviceType,
         userAgent,
         ipAddress,
         fingerprint
        },
    });
};