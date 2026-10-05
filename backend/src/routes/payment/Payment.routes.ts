import express from "express"
import { PaymentController } from "../../controllers/payments/Payment.controller.ts";
import { authenticate, require2FA } from "../../middlewares/auth.middleware.ts";
import { requireTenantContext } from "../../middlewares/requireTenantContext.middleware.ts";
import { idempotencyMiddleware } from "../../middlewares/idempotency.middleware.ts";
import { maintenanceGuard } from "../../middlewares/maintainence.ts";
import { requirePermission } from "../../middlewares/permission.middleware.ts";
import { verifyPaymentWebhook } from "../../middlewares/peymetWebhook.middleware.ts";
import { rateLimit } from "../../middlewares/rateLimit.middleware.ts";
import { webhookSignatureGuard } from "../../middlewares/verifyWebhookSignature.middleware.ts";
import { webhookRateLimit } from "../../middlewares/webhookRateLimit.middleware.ts";
import { PaymentWebhookController } from "../../controllers/payments/Paymentwebhook.controller.ts";
import { PaymentAnomalyController } from "../../controllers/payments/PaymentAnomaly.controller.ts";
import { CashDrawerController } from "../../controllers/payments/CashDrawer.controller.ts";
import { CashierPaymentController } from "../../controllers/payments/CashierPayment.controller.ts";
import { checkRole } from "../../middlewares/checkRole.middleware.ts";
import { rawBodyParser } from "../../middlewares/rawBodyParser.middleware.ts";


const router = express.Router(); 
 
// Provider webhooks. No idempotencyMiddleware / header-based replay check
// here: providers send neither an Idempotency-Key nor tenant context. Each
// handler verifies the signature over the raw body and deduplicates on the
// verified provider event id (WebhookEventLedger).

// Stripe webhook — raw body required for signature verification
router.post(
  "/webhooks/stripe",
  rawBodyParser,
  webhookRateLimit,
  webhookSignatureGuard,
  PaymentWebhookController.handleStripe
);
 
// EVC Plus webhook — raw JSON body, HMAC signature in x-evc-signature header
router.post(
  "/webhooks/evc",
  rawBodyParser,
  webhookRateLimit,
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
router.use(requireTenantContext);

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
  rateLimit({ keyPrefix: "payment.retry", limit: 5, windowSeconds: 300 }),
  PaymentController.retryPayment
);
 
// Poll provider for current payment status
router.get(
  "/payments/:paymentUuid/status",
  PaymentController.getStatus
);
 
export default router;
