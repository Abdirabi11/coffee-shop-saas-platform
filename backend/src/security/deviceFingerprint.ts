import crypto from "crypto";
import type { Request } from "express";

const FINGERPRINT_SALT = process.env.FINGERPRINT_SALT!;

export const generateDeviceFingerprint= async (req: Request)=>{
    const userAgent= req.headers["user-agent"] ?? "unknown";
    const acceptLanguage= req.headers["accept-language"] ?? "unknown";

    const ip= 
        (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
        req.socket.remoteAddress ||
        "unknown";

    const ipSubnet = ip.split(".").slice(0, 2).join(".");

    const raw = [
        userAgent,
        acceptLanguage,
        ipSubnet,
        FINGERPRINT_SALT,
    ].join("|");
    
    return crypto.createHash("sha256").update(raw).digest("hex");
};

export const buildFingerprint = (req: Request) => {
    const ua = req.headers["user-agent"] || "";
    const lang = req.headers["accept-language"] || "";
    const deviceId = req.cookies?.deviceId || "";
  
    return crypto
      .createHash("sha256")
      .update(`${ua}|${lang}|${deviceId}`)
      .digest("hex");
  };