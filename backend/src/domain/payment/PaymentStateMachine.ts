export type PaymentState =
  | "PENDING"
  | "AUTHORIZED"
  | "PAID"
  | "COMPLETED"    // Cashier flow uses COMPLETED
  | "FAILED"
  | "RETRYING"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "CANCELLED"
  | "VOIDED";      // Void flow
 
const transitions: Record<PaymentState, PaymentState[]> = {
  PENDING: ["AUTHORIZED", "PAID", "COMPLETED", "FAILED", "RETRYING", "CANCELLED"],
  AUTHORIZED: ["PAID", "COMPLETED", "FAILED", "CANCELLED"],
  RETRYING: ["PAID", "COMPLETED", "FAILED", "CANCELLED"],
  PAID: ["REFUNDED", "PARTIALLY_REFUNDED", "VOIDED"],
  COMPLETED: ["REFUNDED", "PARTIALLY_REFUNDED", "VOIDED"], // Cashier payments
  FAILED: ["RETRYING", "CANCELLED"],
  CANCELLED: [],
  REFUNDED: [],
  PARTIALLY_REFUNDED: ["REFUNDED", "PARTIALLY_REFUNDED"],
  VOIDED: [],
};

 
export class PaymentStateMachine {
    static assertTransition(from: string, to: string) {
        const validFrom = from as PaymentState;
        const validTo = to as PaymentState;
    
        if (!transitions[validFrom]?.includes(validTo)) {
            throw new Error(`INVALID_PAYMENT_TRANSITION: ${from} → ${to}`);
        }
    }
    
    static canTransition(from: string, to: string): boolean {
        return transitions[from as PaymentState]?.includes(to as PaymentState) ?? false;
    }
    
    static getValidTransitions(from: string): PaymentState[] {
        return transitions[from as PaymentState] ?? [];
    }
    
    static isTerminal(state: string): boolean {
        const terminalStates: PaymentState[] = ["CANCELLED", "REFUNDED", "VOIDED"];
        return terminalStates.includes(state as PaymentState);
    }
}