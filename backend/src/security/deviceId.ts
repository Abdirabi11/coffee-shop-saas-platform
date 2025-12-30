import { randomUUID } from "crypto";
import type { Request, Response } from "express";

export const getOrCreateDeviceId = (req: Request, res?: Response) => {
  let deviceId = req.cookies?.deviceId;

  if (!deviceId) {
    deviceId = randomUUID();

    if (res) {
      res.cookie("deviceId", deviceId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      });
    }
  }

  return deviceId;
};

export const getDeviceType = (userAgent: string): string => {
    const ua = userAgent.toLowerCase();
  
    if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) {
      return "MOBILE";
    }
  
    if (ua.includes("tablet") || ua.includes("ipad")) {
      return "TABLET";
    }
  
    if (ua.includes("postman")) {
      return "API_CLIENT";
    }
  
    return "WEB";
};
  
