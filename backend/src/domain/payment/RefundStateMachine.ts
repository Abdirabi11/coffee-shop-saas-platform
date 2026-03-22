export type RefundStatus =
  | "REQUESTED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";
 
const transitions: Record<RefundStatus, RefundStatus[]> = {
  REQUESTED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};
 
export class RefundStateMachine {
  static assertTransition(from: string, to: string) {
    const validFrom = from as RefundStatus;
    const validTo = to as RefundStatus;
 
    if (!transitions[validFrom]?.includes(validTo)) {
      throw new Error(`INVALID_REFUND_TRANSITION: ${from} → ${to}`);
    }
  }
 
  static canTransition(from: string, to: string): boolean {
    return transitions[from as RefundStatus]?.includes(to as RefundStatus) ?? false;
  }
 
  static isTerminal(state: string): boolean {
    return ["COMPLETED", "FAILED", "CANCELLED"].includes(state);
  }
}