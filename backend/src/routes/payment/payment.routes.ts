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

// ══════════════════════════════════════════════════════════════════════════════
//  WEBHOOK ROUTES — NO AUTH, signature-verified only
//  These MUST come BEFORE router.use(authenticate)
// ══════════════════════════════════════════════════════════════════════════════

router.post(
  "/webhooks/stripe",
  rawBodyParser,
  webhookRateLimit,
  webhookSignatureGuard,
  preventReplayAttack,
  idempotencyMiddleware,
  PaymentWebhookController.handleStripe
);

router.post(
  "/webhooks/evc",
  webhookRateLimit,
  preventReplayAttack,
  idempotencyMiddleware,
  PaymentWebhookController.handleEVC
);

router.post(
  "/webhooks/payments",
  rawBodyParser,
  webhookSignatureGuard,
  preventReplayAttack,
  idempotencyMiddleware,
  PaymentWebhookController.handle
);

// ══════════════════════════════════════════════════════════════════════════════
//  AUTHENTICATED ROUTES — Everything below requires auth
// ══════════════════════════════════════════════════════════════════════════════

router.use(authenticate);

// ── Provider Payment Flow ───────────────────────────────────────────────────
router.post(
  "/payments/start",
  PaymentController.startPayment
);

router.post(
  "/payments/confirm",
  maintenanceGuard,
  rateLimit("payment.confirm"),
  idempotencyMiddleware,
  PaymentController.confirmPayment
);

router.post(
  "/payments/:paymentUuid/retry",
  require2FA,
  requirePermission("PAYMENT_RETRY"),
  maintenanceGuard,
  idempotencyMiddleware,
  rateLimit("payment.retry"),
  PaymentController.retryPayment
);

router.get(
  "/payments/:paymentUuid/status",
  PaymentController.getStatus
);

// ── Cashier Payment Flow ────────────────────────────────────────────────────
router.post(
  "/payments/cashier/process",
  checkRole(["CASHIER", "MANAGER", "ADMIN"]),
  CashierPaymentController.processPayment
);

router.post(
  "/payments/cashier/:paymentUuid/void",
  checkRole(["MANAGER", "ADMIN"]),
  CashierPaymentController.voidPayment
);

router.post(
  "/payments/cashier/:paymentUuid/correct",
  checkRole(["ADMIN"]),
  CashierPaymentController.correctPayment
);

// ── Cash Drawer ─────────────────────────────────────────────────────────────
router.post(
  "/payments/drawer/open",
  checkRole(["CASHIER", "MANAGER", "ADMIN"]),
  CashDrawerController.openDrawer
);

router.post(
  "/payments/drawer/:drawerUuid/close",
  checkRole(["CASHIER", "MANAGER", "ADMIN"]),
  CashDrawerController.closeDrawer
);

router.get(
  "/payments/drawer/:drawerUuid",
  CashDrawerController.getDrawer
);

router.get(
  "/payments/drawer/active/:terminalId",
  CashDrawerController.getActiveDrawer
);

// ── Anomalies & Review ──────────────────────────────────────────────────────
router.get(
  "/payments/anomalies",
  checkRole(["MANAGER", "ADMIN"]),
  PaymentAnomalyController.list
);

router.post(
  "/payments/anomalies/:anomalyUuid/review",
  checkRole(["MANAGER", "ADMIN"]),
  PaymentAnomalyController.review
);

router.get(
  "/payments/flagged",
  checkRole(["MANAGER", "ADMIN"]),
  PaymentAnomalyController.listFlaggedPayments
);

 
export default router;