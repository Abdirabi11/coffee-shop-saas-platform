import { RiskPolicyEnforcer } from "../../services/fraud/riskPolicyEnforcer.service.ts";

type PaymentState =
    | "PENDING"
    | "AUTHORIZED"
    | "PAID"
    | "FAILED"
    | "RETRYING"
    | "REFUNDED"
    | "CANCELLED";
    | "PARTIALLY_REFUNDED";


const transitions: Record<PaymentState, PaymentState[]> = {
    PENDING: ["AUTHORIZED", "PAID", "FAILED", "RETRYING", "CANCELLED"],
    AUTHORIZED: ["PAID", "FAILED", "CANCELLED"],
    RETRYING: ["PAID", "FAILED", "CANCELLED"],
    PAID: ["REFUNDED", "PARTIALLY_REFUNDED"],
    FAILED: ["RETRYING", "CANCELLED"],
    CANCELLED: [],
    REFUNDED: [],
    PARTIALLY_REFUNDED: ["REFUNDED"], 
};

//emit risk events
await RiskPolicyEnforcer.apply()

export class PaymentStateMachine {
    static assertTransition(from: PaymentState, to: PaymentState) {
        if (!transitions[from]?.includes(to)) {
          throw new Error(
            `INVALID_PAYMENT_TRANSITION: ${from} → ${to}`
          );
        }
    }

    static canTransition(from: PaymentState, to: PaymentState): boolean {
        return transitions[from]?.includes(to) ?? false;
    }
    
    static getValidTransitions(from: PaymentState): PaymentState[] {
        return transitions[from] ?? [];
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