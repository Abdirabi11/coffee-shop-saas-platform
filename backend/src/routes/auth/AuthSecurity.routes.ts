import express from "express";
import { AuthController } from "../../controllers/auth/Auth.controller.ts";
import { authenticate } from "../../middlewares/auth.middleware.ts";
import { DeviceTrustController } from "../../controllers/security/Security.controller.ts";
import { FraudReviewController } from "../../controllers/security/FraudReview.controller.ts";
import { AuditLogController } from "../../controllers/security/AuditLog.controller.ts";
import { IPWhitelistController } from "../../controllers/security/IPWhitelist.controller.ts";
import { tokenRotateRateLimit } from "../../middlewares/AuthRateLimit.middleware.ts";

 
const router = express.Router();

router.post(
  "/auth/token/rotate",
  tokenRotateRateLimit,                    // 20 per 15 min
  AuthController.rotateToken
);
 
router.post(
  "/auth/logout",
  AuthController.logout                    // No auth required — works with cookie
);
 
router.post(
  "/auth/logout/all",
  authenticate,
  AuthController.logoutAll
);
 
router.get(
  "/auth/sessions",
  authenticate,
  AuthController.listSessions
);
 
router.post(
  "/auth/sessions/:sessionUuid/revoke",
  authenticate,
  AuthController.revokeSession
);
 
router.post(
  "/auth/password/change",
  authenticate,
  passwordChangeRateLimit,                 // 5 per hour
  AuthController.changePassword
);
 
router.get(
  "/auth/me",
  authenticate,
  AuthController.me
);
 
//Device Trust (authenticated users)
 
router.get(
  "/security/devices",
  authenticate,
  DeviceTrustController.listDevices
);
 
router.post(
  "/security/devices/:deviceUuid/revoke",
  authenticate,
  DeviceTrustController.revokeDevice
);
 
router.get(
  "/security/devices/status",
  authenticate,
  DeviceTrustController.getDeviceStatus
);
 
//Fraud Review (ADMIN+)
 
router.get(
  "/security/fraud/stats",               // Must be before /:uuid
  authenticate,
  checkRole(["ADMIN", "TENANT_ADMIN"]),
  FraudReviewController.getStats
);
 
router.get(
  "/security/fraud",
  authenticate,
  checkRole(["ADMIN", "TENANT_ADMIN"]),
  FraudReviewController.listEvents
);
 
router.get(
  "/security/fraud/:uuid",
  authenticate,
  checkRole(["ADMIN", "TENANT_ADMIN"]),
  FraudReviewController.getEvent
);
 
router.post(
  "/security/fraud/:uuid/review",
  authenticate,
  checkRole(["ADMIN", "TENANT_ADMIN"]),
  FraudReviewController.reviewEvent
);
 
//Audit Log (ADMIN+)
 
router.get(
  "/security/audit/summary",             // Must be before /:uuid
  authenticate,
  checkRole(["ADMIN", "TENANT_ADMIN"]),
  AuditLogController.getSummary
);
 
router.get(
  "/security/audit",
  authenticate,
  checkRole(["ADMIN", "TENANT_ADMIN"]),
  AuditLogController.search
);
 
router.get(
  "/security/audit/:uuid",
  authenticate,
  checkRole(["ADMIN", "TENANT_ADMIN"]),
  AuditLogController.getDetail
);
 
//IP Whitelist (ADMIN only)
 
router.get(
  "/security/ip-whitelist",
  authenticate,
  checkRole(["ADMIN", "TENANT_ADMIN"]),
  IPWhitelistController.list
);
 
router.post(
  "/security/ip-whitelist",
  authenticate,
  checkRole(["ADMIN", "TENANT_ADMIN"]),
  IPWhitelistController.add
);
 
router.delete(
  "/security/ip-whitelist/:uuid",
  authenticate,
  checkRole(["ADMIN", "TENANT_ADMIN"]),
  IPWhitelistController.remove
);
 
router.post(
  "/security/ip-whitelist/check",
  authenticate,
  checkRole(["ADMIN", "TENANT_ADMIN"]),
  IPWhitelistController.check
);
 
export default router;
 