export type CashierPaymentState =
  | "DECLARED"     
  | "VERIFIED"    
  | "DISPUTED"    
  | "VOIDED"       
  | "RECONCILED";  

const transitions: Record<CashierPaymentState, CashierPaymentState[]> = {
    DECLARED: ["VERIFIED", "DISPUTED", "VOIDED"],
    VERIFIED: ["RECONCILED", "DISPUTED"],
    DISPUTED: ["VERIFIED", "VOIDED", "RECONCILED"], 
    VOIDED: [],  
    RECONCILED: [], 
};

export class CashierPaymentStateMachine {
    static assertTransition(
      from: CashierPaymentState,
      to: CashierPaymentState
    ) {
        if(!transitions[from]?.includes(to)){
            throw new Error(
                `INVALID_CASHIER_PAYMENT_TRANSITION: ${from} → ${to}`
            );
        };
    }

    static canTransition(
        from: CashierPaymentState,
        to: CashierPaymentState
    ): boolean {
        return transitions[from]?.includes(to) ?? false;
    }
    
    static isTerminal(state: CashierPaymentState): boolean {
        return ["VOIDED", "RECONCILED"].includes(state);
    }
}