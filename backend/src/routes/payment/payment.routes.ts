import express from "express"
import { PaymentController } from "../../controllers/payments/payment.controller.ts";
import { authenticate, require2FA } from "../../middlewares/auth.middleware.ts";
import { idempotencyMiddleware } from "../../middlewares/idempotency.middleware.ts";
import { maintenanceGuard } from "../../middlewares/maintainence.ts";
import { requirePermission } from "../../middlewares/permission.middleware.ts";
import { verifyPaymentWebhook } from "../../middlewares/peymetWebhook.middleware.ts";
import { rateLimit } from "../../middlewares/rateLimit.middleware.ts";
import { preventReplayAttack } from "../../middlewares/replayProtection.middleware.ts";
import { webhookSignatureGuard } from "../../middlewares/verifyWebhookSignature.middlware.ts";
import { webhookRateLimit } from "../../middlewares/webhookRateLimit.middleware.ts";
import { PaymentWebhookController } from "../../controllers/payments/PaymentWebhook.controller.ts";
import { PaymentAnomalyController } from "../../controllers/payments/PaymentAnomaly.controller.ts";
import { CashDrawerController } from "../../controllers/payments/CashDrawer.controller.ts";
import { CashierPaymentController } from "../../controllers/payments/CashierPayment.controller.ts";
import { checkRole } from "../../middlewares/checkRole.middleware.ts";
import { rawBodyParser } from "../../middlewares/rawBodyParser.middleware.ts";


const router = express.Router(); 
 
// Stripe webhook — raw body required for signature verification
router.post(
  "/webhooks/stripe",
  rawBodyParser,
  webhookRateLimit,
  webhookSignatureGuard,
  preventReplayAttack,
  idempotencyMiddleware,
  PaymentWebhookController.handleStripe
);
 
// EVC Plus webhook — JSON body, HMAC signature in x-evc-signature header
router.post(
"/webhooks/evc",
webhookRateLimit,
preventReplayAttack,
idempotencyMiddleware,
PaymentWebhookController.handleEVC
);
 
// Generic provider webhook (future providers)
// router.post(
//   "/webhooks/payments",
//   rawBodyParser,
//   webhookSignatureGuard,
//   preventReplayAttack,
//   idempotencyMiddleware,
//   PaymentWebhookController.handle
// );
 
// ══════════════════════════════════════════════════════════════════════════════
//  AUTHENTICATED ROUTES — Provider Payment Flow
//  Mobile app / customer-facing payment initiation
// ══════════════════════════════════════════════════════════════════════════════
 
router.use(authenticate);
 
// Start a provider payment (creates Stripe PaymentIntent or EVC session)
// Body: { orderUuid: string, provider: "STRIPE" | "EVC_PLUS" }
router.post(
    "/payments/start",
    PaymentController.startPayment
);
 
// Confirm payment (client-side confirmation callback)
// router.post(
//     "/payments/confirm",
//     maintenanceGuard,
//     rateLimit("payment.confirm"),
//     idempotencyMiddleware,
//     PaymentController.confirmPayment
// );
 
// Retry a failed payment (requires 2FA + PAYMENT_RETRY permission)
router.post(
  "/payments/:paymentUuid/retry",
  require2FA,
  requirePermission("PAYMENT_RETRY"),
  maintenanceGuard,
  idempotencyMiddleware,
  rateLimit("payment.retry"),
  PaymentController.retryPayment
);
 
// Poll provider for current payment status
router.get(
  "/payments/:paymentUuid/status",
  PaymentController.getStatus
);
 
export default router;
