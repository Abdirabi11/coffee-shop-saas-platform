import express from "express"
import { authenticate } from "../../middlewares/auth.middleware.ts";
import { checkRole } from "../../middlewares/checkRole.middleware.ts";
import { DeviceTrustController } from "../../controllers/security/Security.controller.ts";
import { FraudReviewController } from "../../controllers/security/FraudReview.controller.ts";
import { AuditLogController } from "../../controllers/security/AuditLog.controller.ts";
import { IPWhitelistController } from "../../controllers/security/IPWhitelist.controller.ts";


const router = express.Router();

const adminOnly = [authenticate, checkRole(["SUPER_ADMIN", "ADMIN", "TENANT_ADMIN"])];

router.get( "/security/devices",               authenticate, DeviceTrustController.listDevices);
router.post("/security/devices/:uuid/revoke",  authenticate, DeviceTrustController.revokeDevice);
router.get( "/security/devices/status",        authenticate, DeviceTrustController.getDeviceStatus);

router.get( "/security/fraud/stats",           ...adminOnly, FraudReviewController.getStats);
router.get( "/security/fraud",                 ...adminOnly, FraudReviewController.listEvents);
router.get( "/security/fraud/:uuid",           ...adminOnly, FraudReviewController.getEvent);
router.post("/security/fraud/:uuid/review",    ...adminOnly, FraudReviewController.reviewEvent);

router.get( "/security/audit/summary",         ...adminOnly, AuditLogController.getSummary);
router.get( "/security/audit",                 ...adminOnly, AuditLogController.search);
router.get( "/security/audit/:uuid",           ...adminOnly, AuditLogController.getDetail);

router.get(   "/security/ip-whitelist",        ...adminOnly, IPWhitelistController.list);
router.post(  "/security/ip-whitelist",        ...adminOnly, IPWhitelistController.add);
router.delete("/security/ip-whitelist/:uuid",  ...adminOnly, IPWhitelistController.remove);
router.post(  "/security/ip-whitelist/check",  ...adminOnly, IPWhitelistController.check);

export default router;