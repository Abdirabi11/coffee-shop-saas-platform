import express from "express"
import { PaymentController } from "../../controllers/payments/payment.controller.ts";
import { authenticate, require2FA } from "../../middlewares/auth.middleware.ts";
import { idempotencyMiddleware } from "../../middlewares/idempotency.middleware.js";
import { maintenanceGuard } from "../../middlewares/maintainence.ts";
import { requirePermission } from "../../middlewares/permission.middleware.ts";
import { verifyPaymentWebhook } from "../../middlewares/peymetWebhook.middleware.js";
import { rateLimit } from "../../middlewares/rateLimit.middleware.ts";
import { preventReplayAttack } from "../../middlewares/replayProtection.middleware.js";
import { webhookSignatureGuard } from "../../middlewares/verifyWebhookSignature.middlware.js";


const router = express.Router();

router.use(authenticate);

router.post(
    "/confirm",
    maintenanceGuard,
    rateLimit("payment.confirm"),
    idempotencyMiddleware,
    verifyPaymentWebhook, 
    PaymentController.confirmPayment
);

router.post( 
    "/failed", 
    maintenanceGuard,
    rateLimit("payment.failed"),
    verifyPaymentWebhook,
    PaymentController.markPaymentFailed 
);

router.post(
    "/retry/:paymentUuid",
    authenticate,
    require2FA,
    requirePermission("PAYMENT_RETRY"),
    maintenanceGuard,
    idempotencyMiddleware,
    rateLimit("payment.retry"),
    PaymentController.retryFailedPayment
);

router.post(
    "/webhooks/payments",
    rawBodyParser,              // must be first
    webhookSignatureGuard,      // authenticity
    preventReplayAttack,        // uniqueness
    idempotencyMiddleware,      // safety
    PaymentWebhookController.handle
);
export default router;