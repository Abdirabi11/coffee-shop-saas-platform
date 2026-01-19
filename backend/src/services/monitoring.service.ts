import prisma  from "../config/prisma.ts"
import { MetricsService } from "./metrics.service.js";

export class MonitoringService{
    static async track<T>(
        operation: string,
        refId: string,
        fn: () => Promise<T>,
        slowThresholdMs = 2000
    ): Promise<T>{
        const start = Date.now();

        try{
            const result = await fn();
            return result;
        } finally{
            const duration = Date.now() - start;

            MetricsService.timing(`${operation}.latency`, duration);

            if (duration > slowThresholdMs) {
                console.warn("[SLOW OPERATION]", {
                  operation,
                  refId,
                  duration,
                });
            }
        }
    }

    static trackLatency(
        operation: string,
        refId: string,
        durationMs: number
    ) {
        MetricsService.timing(`${operation}.latency`, durationMs);
    }
}