import prisma from "../../config/prisma.ts"


export class PaymentRiskScoreService{
    static async get(userUuid: string): Promise<number>{
        const record = await prisma.paymentRisk.findUnique({
            where: { userUuid },
        });
      
        return record?.score ?? 0;
    }

    //event-driven signals
    static async increase(input: {
        userUuid: string,
        delta: number,
        reason: string,
        source?: string,
    }){
        await prisma.$transaction(async (tx) => {
            await prisma.paymentRisk.upsert({
                where: { userUuid: input.userUuid },
                update: {
                  score: { increment: input.delta },
                  updatedAt: new Date(),
                },
                create: {
                  userUuid: input.userUuid,
                  score: input.delta,
                },
            });
        
            await prisma.fraudEvent.create({
                data: {
                    userUuid: input.userUuid,
                    type: input.reason,
                    severity:
                      input.delta >= 50
                        ? "CRITICAL"
                        : input.delta >= 25
                        ? "HIGH"
                        : "MEDIUM",
                    source: input.source ?? "PAYMENT_SYSTEM",
                },
            }); 
        })
    }

    //reconciliation / admin / decay jobs
    static async adjust(input: {userUuid: string, newScore: number, reason: string}){
        await prisma.paymentRisk.upsert({
            where: { userUuid: input.userUuid },
            update: {
                score: input.newScore,
                updatedAt: new Date(),
            },
            create: {
                userUuid: input.userUuid,
                score: input.newScore,
            },
        });

        await prisma.fraudEvent.create({
            data: {
              userUuid: input.userUuid,
              type: "RISK_SCORE_ADJUSTED",
              severity: "LOW",
              metadata: {
                reason: input.reason,
                newScore: input.newScore,
              },
            },
          });
    }
};