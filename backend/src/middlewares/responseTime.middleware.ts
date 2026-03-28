import type { Request, Response, NextFunction } from "express";
import { logWithContext } from "../infrastructure/observability/logger.ts";
import { MetricsService } from "../infrastructure/observability/metricsService.ts";

export const responseTimeMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const startTime = Date.now();
  
    // Capture response finish
    res.on("finish", () => {
        const duration = Date.now() - startTime;
    
        // Set response time header
        res.setHeader("X-Response-Time", `${duration}ms`);
    
        // Track metrics
        MetricsService.timing("http.response_time", duration, {
            method: req.method,
            route: req.route?.path || req.path,
            status: res.statusCode.toString(),
        });
  
        // Log slow requests
        if (duration > 1000) {
            logWithContext("warn", "[Performance] Slow request detected", {
                method: req.method,
                path: req.path,
                duration,
                statusCode: res.statusCode,
            });
        }
    });
  
    next();
};