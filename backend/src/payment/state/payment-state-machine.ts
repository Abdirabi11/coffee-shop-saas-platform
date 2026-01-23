

type PaymentState =
    | "PENDING"
    | "PAID"
    | "FAILED"
    | "REFUNDED"
    | "CANCELLED";

const transitions: Record<PaymentState, PaymentState[]> = {
    PENDING: ["PAID", "FAILED", "CANCELLED"],
    FAILED: ["PENDING"],
    PAID: ["REFUNDED"],
    REFUNDED: [],
    CANCELLED: [],
};

export class PaymentStateMachine {
    static assertTransition(
      from: PaymentState,
      to: PaymentState
    ) {
      if (!transitions[from].includes(to)) {
        throw new Error(
          `INVALID_PAYMENT_TRANSITION ${from} → ${to}`
        );
      }
    }
}

// ✅ Usage Example
// PaymentStateMachine.assertTransition(
//   payment.status,
//   "PAID"
// );

// await prisma.payment.update({
//   where: { uuid: payment.uuid },
//   data: { status: "PAID", lockedAt: null },
// });