import express from "express";
import { getAdminAlerts, resolveAdminAlert } from "../controllers/admin.notification.controller.ts";
import { authenticate, authorize } from "../middlewares/auth.middleware.ts";


const router= express.Router()

router.use(authenticate, authorize("ADMIN", "SUPER_ADMIN"));

router.get("/alerts", getAdminAlerts);
router.post("/alerts/:uuid/resolve", resolveAdminAlert);

export default router;