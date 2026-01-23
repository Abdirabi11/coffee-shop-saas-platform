import prisma from "../../config/prisma.ts"

export class PaymentIntentService{
    static async lock(orderUuid: string){
        const intent = await prisma.paymentIntent.findUnique({
            where: { orderUuid },
        });
      
        if (intent?.lockedAt) {
            throw new Error("PAYMENT_IN_PROGRESS");
        };

        await prisma.paymentIntent.upsert({
            where: { orderUuid },
            update: { lockedAt: new Date(), status: "LOCKED" },
            create: {
              orderUuid,
              lockedAt: new Date(),
              status: "LOCKED",
            },
        });
    }

    static async unlock(orderUuid: string){
        await prisma.paymentIntent.update({
            where: { orderUuid },
            data: { lockedAt: null },
        });
    }
}

const ALLOWED_TRANSITIONS = {
    CREATED: ["LOCKED"],
    LOCKED: ["PAID", "FAILED"],
    PAID: ["REFUNDED"],
};
  
export function assertTransition(from: string, to: string) {
    if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
      throw new Error(`INVALID_PAYMENT_TRANSITION ${from} → ${to}`);
    }
};