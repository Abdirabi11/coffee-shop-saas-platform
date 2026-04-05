import { Request, Response } from "express";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";

export class MetricsController {
    //GET /metrics
    //Prometheus-compatible metrics endpoint
    static async getMetrics(req: Request, res: Response) {
        try {
            const metrics = await MetricsService.getMetrics();
            
            res.set("Content-Type", "text/plain");
            res.send(metrics);
        } catch (error: any) {
            res.status(500).send("Failed to collect metrics");
        }
    }
}