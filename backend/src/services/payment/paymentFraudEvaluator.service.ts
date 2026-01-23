import prisma from "../../config/prisma.ts"

export class PaymentFraudEvaluator{
    static async evaluate(type: string, payload: any){
        if (type === "PAYMENT_FAILED") {
            await this.detectFailureVelocity(payload);
        };

        if (type === "REFUND_COMPLETED") {
            await this.detectRefundAbuse(payload);
        }
    }

    private static async detectFailureVelocity({ userUuid }) {
        if (!userUuid) return;

        const count = await prisma.fraudEvent.count({
            where: {
              userUuid,
              type: "PAYMENT_FAILED",
              createdAt: {
                gt: new Date(Date.now() - 10 * 60 * 1000),
              },
            },
        });

        if (count >= 3) {
            await prisma.fraudEvent.create({
              data: {
                userUuid,
                type: "MULTIPLE_PAYMENT_FAILED",
                severity: "HIGH",
              },
            });
      
            // optional action
            await evaluateAutoBan(userUuid);
        }
    }

    private static async detectRefundAbuse({ orderUuid, amount }) {
        if (!orderUuid) return;
    
        if (amount && amount > 500) {
          await prisma.fraudEvent.create({
            data: {
              orderUuid,
              type: "REFUND_ABUSE",
              severity: "HIGH",
            },
          });
        }
    }
}