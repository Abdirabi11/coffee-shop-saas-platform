import express from "express"
import { MetricsController } from "../../controllers/metrics/metrics.controller.ts";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";

const router = express.Router();

// Prometheus-format metrics. Super admins only: the output names internal
// queues, jobs and per-tenant counters.
router.get("/metrics", authenticate, authorize(["SUPER_ADMIN"]), MetricsController.getMetrics);

export default router;
