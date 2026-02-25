import express from "express"
import { MetricsController } from "../../controllers/metrics/metrics.controller.ts";

const router = express.Router();

// Public endpoint (or protect with API key)
router.get("/metrics", MetricsController.getMetrics);

export default router;