import type { Request, Response, NextFunction } from "express";
import { logWithContext } from "../infrastructure/observability/Logger.ts";
import { MetricsService } from "../infrastructure/observability/MetricsService.ts";

export const responseTimeMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const startTime = Date.now();

    // Hook into response BEFORE it sends (not after)
    const originalEnd = res.end;
    res.end = function (...args: any[]) {
        const duration = Date.now() - startTime;
        res.setHeader("X-Response-Time", `${duration}ms`);
        return originalEnd.apply(this, args);
    } as any;

    // Log after finish (headers already sent, just metrics)
    res.on("finish", () => {
        const duration = Date.now() - startTime;
        MetricsService.timing("http.response_time", duration, {
            method: req.method,
            route: req.route?.path || req.path,
            status: res.statusCode.toString(),
        });

        if (duration > 1000) {
            logWithContext("warn", "[Performance] Slow request", {
                method: req.method,
                path: req.path,
                duration,
            });
        }
    });

  next();
};