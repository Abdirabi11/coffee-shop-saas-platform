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


const router = express.Router();

router.use(authenticate);

// 8️⃣ Security Gap in Routes (small but real)
// Why does a client route need webhook verification?
router.post(
    "/confirm",
    maintenanceGuard,
    rateLimit("payment.confirm"),
    idempotencyMiddleware,
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

router.post(
    "/webhooks/stripe",
    webhookRateLimit,  // ✅ Add rate limiting
    PaymentWebhookController.handleStripe
);

router.post("/payments/start", authenticate, PaymentController.startPayment);
router.post("/payments/:paymentUuid/retry", authenticate, PaymentController.retryPayment);
router.get("/payments/:paymentUuid/status", authenticate, PaymentController.getStatus);
 
// ── Cashier Payment Flow ────────────────────────────────────────────────────
router.post(
  "/payments/cashier/process",
  authenticate,
  checkRole(["CASHIER", "MANAGER", "ADMIN"]),
  CashierPaymentController.processPayment
);
router.post(
  "/payments/cashier/:paymentUuid/void",
  authenticate,
  checkRole(["MANAGER", "ADMIN"]),
  CashierPaymentController.voidPayment
);
router.post(
  "/payments/cashier/:paymentUuid/correct",
  authenticate,
  checkRole(["ADMIN"]),
  CashierPaymentController.correctPayment
);
 
// ── Cash Drawer ─────────────────────────────────────────────────────────────
router.post(
  "/payments/drawer/open",
  authenticate,
  checkRole(["CASHIER", "MANAGER", "ADMIN"]),
  CashDrawerController.openDrawer
);
router.post(
  "/payments/drawer/:drawerUuid/close",
  authenticate,
  checkRole(["CASHIER", "MANAGER", "ADMIN"]),
  CashDrawerController.closeDrawer
);
router.get(
  "/payments/drawer/:drawerUuid",
  authenticate,
  CashDrawerController.getDrawer
);
router.get(
  "/payments/drawer/active/:terminalId",
  authenticate,
  CashDrawerController.getActiveDrawer
);
 
// ── Anomalies & Review ──────────────────────────────────────────────────────
router.get(
  "/payments/anomalies",
  authenticate,
  checkRole(["MANAGER", "ADMIN"]),
  PaymentAnomalyController.list
);
router.post(
  "/payments/anomalies/:anomalyUuid/review",
  authenticate,
  checkRole(["MANAGER", "ADMIN"]),
  PaymentAnomalyController.review
);
router.get(
  "/payments/flagged",
  authenticate,
  checkRole(["MANAGER", "ADMIN"]),
  PaymentAnomalyController.listFlaggedPayments
);
 
// ── Webhooks (no auth — signature verified internally) ──────────────────────
router.post("/webhooks/stripe", PaymentWebhookController.handleStripe);
router.post("/webhooks/evc", PaymentWebhookController.handleEVC);
 
export default router;