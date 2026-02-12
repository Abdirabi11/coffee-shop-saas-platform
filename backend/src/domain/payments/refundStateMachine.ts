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
    static assertTransition(from: RefundStatus, to: RefundStatus) {
      if (!transitions[from]?.includes(to)) {
        throw new Error(
          `INVALID_REFUND_TRANSITION ${from} → ${to}`
        );
      }
    }
};