import prisma from "../config/prisma.ts"

type EmailPayload =
  | { type: "PAYMENT_RECEIPT"; orderUuid: string }
  | { type: "PAYMENT_FAILED"; orderUuid: string }
  | { type: "REFUND_REQUESTED"; orderUuid: string }
  | { type: "REFUND_COMPLETED"; orderUuid: string };


export class EmailService{
    static async send(payload: EmailPayload){
        await prisma.emailOutBox.create({
            data: {
                type: payload.type,
                payload,
                status: "PENDING",
            },
        })
    };

    static sendPaymentReceipt(orderUuid: string) {
        return this.send({ type: "PAYMENT_RECEIPT", orderUuid });
    }
    
    static sendPaymentFailed(orderUuid: string) {
        return this.send({ type: "PAYMENT_FAILED", orderUuid });
    }
    
    static sendRefundRequested(orderUuid: string) {
        return this.send({ type: "REFUND_REQUESTED", orderUuid });
    }
    
    static sendRefundCompleted(orderUuid: string) {
        return this.send({ type: "REFUND_COMPLETED", orderUuid });
    }
};