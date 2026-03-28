import prisma from "../config/prisma.ts"

type PaymentEmailType =
  | "PAYMENT_RECEIPT"
  | "PAYMENT_FAILED"
  | "REFUND_REQUESTED"
  | "REFUND_COMPLETED";


export class PaymentEmailOutbox{
    static async queue(type: PaymentEmailType, orderUuid: string) {
        await prisma.emailOutbox.create({
            data: {
                type,
                payload: { type, orderUuid },
                status: "PENDING",
            },
        });
    }

    static sendPaymentReceipt(orderUuid: string) {
        return this.queue("PAYMENT_RECEIPT", orderUuid);
    }

    static sendPaymentFailed(orderUuid: string) {
        return this.queue("PAYMENT_FAILED", orderUuid);
    }

    static sendRefundRequested(orderUuid: string) {
        return this.queue("REFUND_REQUESTED", orderUuid);
    }

    static sendRefundCompleted(orderUuid: string) {
        return this.queue("REFUND_COMPLETED", orderUuid);
    }
};