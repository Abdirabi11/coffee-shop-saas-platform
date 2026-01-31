type PaymentState =
    | "PENDING"
    | "PAID"
    | "FAILED"
    | "RETRYING"
    | "REFUNDED"
    | "CANCELLED";


const transitions: Record<PaymentState, PaymentState[]> = {
    PENDING: ["PAID", "FAILED", "CANCELLED"],
    FAILED: ["PENDING"],
    RETRYING: ["PAID", "FAILED"],
    PAID: ["REFUNDED"],
    REFUNDED: [],
    CANCELLED: [],
};

//emit risk events
await RiskPolicyEnforcer.apply()

export class PaymentStateMachine {
    static assertTransition(from: PaymentState, to: PaymentState) {
        if (!transitions[from].includes(to)) {
            throw new Error(
                `INVALID_PAYMENT_TRANSITION ${from} → ${to}`
            );
        }
    }
};

// ✅ Usage Example
// PaymentStateMachine.assertTransition(
//   payment.status,
//   "PAID"
// );

// await prisma.payment.update({
//   where: { uuid: payment.uuid },
//   data: { status: "PAID", lockedAt: null },
// });