import express from "express"
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";
import { CashierPaymentController } from "../../controllers/payments/CashierPayment.controller.ts";
import { checkRole } from "../../middlewares/checkRole.middleware.ts";


const router = express.Router();
 
router.use(authenticate);
 
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
router.post(
    "/process",
    checkRole(["CASHIER", "MANAGER", "ADMIN"]),
    CashierPaymentController.processPayment
);
 
// Void a completed payment (manager PIN required)
// Body: { voidReason: string, managerPin: string }
router.post(
    "/:paymentUuid/void",
    checkRole(["MANAGER", "ADMIN"]),
    CashierPaymentController.voidPayment
);
 
// Correct a payment amount (admin only, audit trail)
// Body: { correctAmount: number, correctionReason: string }
router.post(
    "/:paymentUuid/correct",
    checkRole(["ADMIN"]),
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
//  CASH DRAWER
//  Open/close drawer sessions, track cash per terminal/shift
// ══════════════════════════════════════════════════════════════════════════════
 
// Open a cash drawer for a shift
// Body: {
//   storeUuid: string,       — which store
//   terminalId: "POS-001",   — which terminal
//   openingBalance: 10000,   — starting cash in cents ($100.00)
//   notes?: string
// }
// router.post(
//     "/drawer/open",
//     checkRole(["CASHIER", "MANAGER", "ADMIN"]),
//     CashDrawerController.openDrawer
// );
 
// Close drawer at end of shift — triggers variance check
// Body: {
//   actualCash: 15000,       — counted cash in cents
//   actualCard?: number,     — card total if tracked
//   closingNotes?: string,
//   cashCount?: {             — optional denomination breakdown
//     pennies?, nickels?, dimes?, quarters?,
//     ones?, fives?, tens?, twenties?, fifties?, hundreds?
//   }
// }
// router.post(
//     "/drawer/:drawerUuid/close",
//     checkRole(["CASHIER", "MANAGER", "ADMIN"]),
//     CashDrawerController.closeDrawer
// );
 
// Get drawer details (open or closed)
// router.get(
//     "/drawer/:drawerUuid",
//     CashDrawerController.getDrawer
// );
 
// Get active (open) drawer by terminal ID
// Query: ?storeUuid= (required if staff.storeUuid not set)
// router.get(
//     "/drawer/active/:terminalId",
//     CashDrawerController.getActiveDrawer
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