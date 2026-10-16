import express from "express"
import { WebhookAdminController } from "../../controllers/webhooks/webhookAdmin.controller.ts";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";




const router = express.Router();

router.use(authenticate);
router.use(authorize("SUPER_ADMIN"));

//GET /api/admin/webhooks/dlq
router.get("/dlq", WebhookAdminController.getDLQ);

//POST /api/admin/webhooks/dlq/:dlqUuid/retry
router.post("/dlq/:dlqUuid/retry", WebhookAdminController.retryDLQ);

//POST /api/admin/webhooks/dlq/retry-bulk
router.post("/dlq/retry-bulk", WebhookAdminController.retryBulk);

//POST /api/admin/webhooks/dlq/:dlqUuid/abandon
router.post("/dlq/:dlqUuid/abandon", WebhookAdminController.abandonDLQ);

//POST /api/admin/webhooks/replay/range
// (before /replay/:eventId, which would otherwise take "range" as an event id)
router.post("/replay/range", WebhookAdminController.replayRange);

//POST /api/admin/webhooks/replay/:eventId  (the provider's event id, e.g. evt_...)
router.post("/replay/:eventId", WebhookAdminController.replayWebhook);

//GET /api/admin/webhooks/statistics
router.get("/statistics", WebhookAdminController.getStatistics);

export default router;
