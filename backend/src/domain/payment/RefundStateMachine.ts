export type RefundStatus =
  | "PENDING_APPROVAL"
  | "REQUESTED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "REJECTED";
 
const transitions: Record<RefundStatus, RefundStatus[]> = {
  // High-risk refunds wait here for a manager; approval queues them for
  // the processor (REQUESTED), rejection ends them
  PENDING_APPROVAL: ["REQUESTED", "REJECTED"],
  REQUESTED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
  REJECTED: [],
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
    return ["COMPLETED", "FAILED", "CANCELLED", "REJECTED"].includes(state);
  }
}