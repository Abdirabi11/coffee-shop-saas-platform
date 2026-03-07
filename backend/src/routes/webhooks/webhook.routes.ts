import express from "express"
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";
import { WebhookManagementController } from "../../controllers/webhooks/WebhookManagement.controller.ts";
import { requireTenantContext } from "../../middlewares/requireTenantContext.middleware.ts";

const router= express.Router()

router.use(authenticate);
router.use(requireTenantContext);

//POST /api/webhooks
router.post(
  "/",
  authorize(["TENANT_ADMIN", "MANAGER"]),
  WebhookManagementController.createWebhook
);

//GET /api/webhooks
router.get(
  "/",
  authorize(["TENANT_ADMIN", "MANAGER"]),
  WebhookManagementController.listWebhooks
);

//GET /api/webhooks/:webhookUuid
router.get(
  "/:webhookUuid",
  authorize(["TENANT_ADMIN", "MANAGER"]),
  WebhookManagementController.getWebhook
);

//PATCH /api/webhooks/:webhookUuid
router.patch(
  "/:webhookUuid",
  authorize(["TENANT_ADMIN", "MANAGER"]),
  WebhookManagementController.updateWebhook
);

//DELETE /api/webhooks/:webhookUuid
router.delete(
  "/:webhookUuid",
  authorize(["TENANT_ADMIN"]),
  WebhookManagementController.deleteWebhook
);

//POST /api/webhooks/:webhookUuid/test
router.post(
  "/:webhookUuid/test",
  authorize(["TENANT_ADMIN", "MANAGER"]),
  WebhookManagementController.testWebhook
);

//POST /api/webhooks/:webhookUuid/rotate-secret
router.post(
  "/:webhookUuid/rotate-secret",
  authorize(["TENANT_ADMIN"]),
  WebhookManagementController.rotateSecret
);

//GET /api/webhooks/:webhookUuid/deliveries
router.get(
  "/:webhookUuid/deliveries",
  authorize(["TENANT_ADMIN", "MANAGER"]),
  WebhookManagementController.getDeliveries
);

//GET /api/webhooks/:webhookUuid/statistics
router.get(
  "/:webhookUuid/statistics",
  authorize(["TENANT_ADMIN", "MANAGER"]),
  WebhookManagementController.getStatistics
);

export default router;