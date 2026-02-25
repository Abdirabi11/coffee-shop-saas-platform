import { Request, Response, NextFunction } from "express";

const ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:19006", // React Native Expo
    "https://app.yourcoffeeapp.com",
    "capacitor://localhost", // Capacitor mobile
    "ionic://localhost", // Ionic mobile
];
  
  export const corsMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const origin = req.headers.origin;
  
    // Check if origin is allowed
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    }
  
    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    );
  
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, x-request-id, x-trace-id, x-tenant-id, x-device-id, idempotency-key"
    );
  
    res.setHeader("Access-Control-Allow-Credentials", "true");
  
    res.setHeader("Access-Control-Max-Age", "86400"); // 24 hours
  
    // Handle preflight
    if (req.method === "OPTIONS") {
      return res.status(204).send();
    }
  
    next();
};