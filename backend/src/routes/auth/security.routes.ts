import express from "express"
import { authenticate } from "../../middlewares/auth.middleware.ts";


const router = express.Router();
 
const adminOnly = [authenticate, checkRole(["SUPER_ADMIN", "ADMIN", "TENANT_ADMIN"])];

router.get( "/security/devices",               authenticate, SecurityController.listDevices);
router.post("/security/devices/:uuid/revoke",  authenticate, SecurityController.revokeDevice);
router.get( "/security/devices/status",        authenticate, SecurityController.getDeviceStatus);

router.get( "/security/fraud/stats",           ...adminOnly, SecurityController.getFraudStats);
router.get( "/security/fraud",                 ...adminOnly, SecurityController.listFraudEvents);
router.get( "/security/fraud/:uuid",           ...adminOnly, SecurityController.getFraudEvent);
router.post("/security/fraud/:uuid/review",    ...adminOnly, SecurityController.reviewFraudEvent);

router.get( "/security/audit/summary",         ...adminOnly, SecurityController.getAuditSummary);
router.get( "/security/audit",                 ...adminOnly, SecurityController.searchAuditLogs);
router.get( "/security/audit/:uuid",           ...adminOnly, SecurityController.getAuditDetail);

router.get(   "/security/ip-whitelist",        ...adminOnly, SecurityController.listIPWhitelist);
router.post(  "/security/ip-whitelist",        ...adminOnly, SecurityController.addIPWhitelist);
router.delete("/security/ip-whitelist/:uuid",  ...adminOnly, SecurityController.removeIPWhitelist);
router.post(  "/security/ip-whitelist/check",  ...adminOnly, SecurityController.checkIPWhitelist);
 
export default router;