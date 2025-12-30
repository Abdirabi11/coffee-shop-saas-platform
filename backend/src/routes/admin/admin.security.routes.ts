import express from "express"
import { 
    getSecurityOverviewController,
    getHighRiskUsersController,
    getSuspiciousSessionsController,
    getSuspiciousIpsController,
    getSessionDetailsController,
    getAuditLogsController,
    getSecurityHeatmapController,
    getHourlyThreatsController
} from "../controllers/admin.security.controller.ts";
import { authenticate, authorize } from "../middlewares/auth.middleware.ts";

const router= express.Router()

router.use(authenticate, authorize("ADMIN", "SUPER_ADMIN"));

router.get("/overview", getSecurityOverviewController);
router.get("/high-risk-users", getHighRiskUsersController);
router.get("/sessions/suspicious", getSuspiciousSessionsController);
router.get("/ips/suspicious", getSuspiciousIpsController);
router.get("/sessions/details", getSessionDetailsController);
router.get("/audit-logs", getAuditLogsController);

router.get("/heatmap/ip", getSecurityHeatmapController);
router.get("/heatmap/time", getHourlyThreatsController);

// router.get("/suspicious-ips", detectSuspiciousIps);


export default router;