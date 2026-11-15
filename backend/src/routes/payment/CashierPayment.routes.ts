import express from "express"
import { authenticate, authorize, storeOf } from "../../middlewares/auth.middleware.ts";
import { requireTenantContext } from "../../middlewares/requireTenantContext.middleware.ts";
import { CashierPaymentController } from "../../controllers/payments/CashierPayment.controller.ts";
import { checkRole } from "../../middlewares/checkRole.middleware.ts";


const router = express.Router();

router.use(authenticate);
router.use(requireTenantContext);

// ══════════════════════════════════════════════════════════════════════════════
//  CASHIER PAYMENT PROCESSING
//  POS/counter payments — cash, card terminal
//  Headers required: Authorization, Idempotency-Key, x-device-id (optional)
// ══════════════════════════════════════════════════════════════════════════════
 
// Process a cash or card-terminal payment against an order
// Body: {
//   orderUuid, paymentMethod: "CASH"|"CARD_TERMINAL",
//   amount?, amountTendered?, changeGiven?,
//   terminalId?, receiptNumber?, notes?
// }
// Roles are checked at the order's own store (not a client-supplied
// storeUuid), so a cashier can only take payments for their stores' orders
router.post(
    "/process",
    checkRole(["CASHIER", "MANAGER", "ADMIN"], storeOf.order("orderUuid", "body")),
    CashierPaymentController.processPayment
);
 
// Void a completed payment (manager PIN required)
// Body: { voidReason: string, managerPin: string }
router.post(
    "/:paymentUuid/void",
    checkRole(["MANAGER", "ADMIN"], storeOf.payment()),
    CashierPaymentController.voidPayment
);
 
// Pay a requested cash refund out of an open drawer (the caller's own, or
// any at the store for a supervisor). Role checked at the refund's store.
// Body: { drawerUuid }
router.post(
    "/refunds/:refundUuid/pay-cash",
    checkRole(["CASHIER", "MANAGER", "ADMIN"], storeOf.record("refund", "refundUuid")),
    CashierPaymentController.payCashRefund
);
 
// Mark a card-terminal refund paid back, after the manager has keyed the
// return on the store's card reader. Role checked at the refund's store.
// Body: { terminalReference? }
router.post(
    "/refunds/:refundUuid/mark-card-refunded",
    checkRole(["MANAGER", "ADMIN"], storeOf.record("refund", "refundUuid")),
    CashierPaymentController.markCardRefunded
);
 
// Correct a payment amount (admin only, audit trail)
// Body: { correctAmount: number, correctionReason: string }
router.post(
    "/:paymentUuid/correct",
    checkRole(["ADMIN"], storeOf.payment()),
    CashierPaymentController.correctPayment
);
 
// Get payment details by UUID
// router.get(
//     "/:paymentUuid",
//     CashierPaymentController.getPaymentDetails
// );
 
// Get payment(s) by order UUID
// router.get(
//     "/order/:orderUuid",
//     CashierPaymentController.getPaymentByOrder
// );
 
// ══════════════════════════════════════════════════════════════════════════════
//  PAYMENT ANOMALIES & FLAGGED PAYMENTS
//  Auto-detected anomalies + manually flagged payments for review
// ══════════════════════════════════════════════════════════════════════════════
 
// List anomalies (auto-detected by anomaly detection job)
// Query: ?storeUuid=&status=&severity=&limit=50
// router.get(
//     "/anomalies",
//     checkRole(["MANAGER", "ADMIN"]),
//     PaymentAnomalyController.list
// );
 
// Review an anomaly — investigate, resolve, dismiss, or confirm
// Body: {
//   status: "INVESTIGATING"|"RESOLVED"|"DISMISSED"|"CONFIRMED",
//   reviewNotes?: string (min 5 chars),
//   resolution?: string
// }
// router.post(
//     "/anomalies/:anomalyUuid/review",
//     checkRole(["MANAGER", "ADMIN"]),
//     PaymentAnomalyController.review
// );
 
// List payments flagged for manual review (not yet reviewed)
// router.get(
//     "/flagged",
//     checkRole(["MANAGER", "ADMIN"]),
//     PaymentAnomalyController.listFlaggedPayments
// );
 
export default router;