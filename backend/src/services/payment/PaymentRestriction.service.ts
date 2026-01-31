import prisma from "../../config/prisma.ts"

export class PaymentRestrictionService{
    static async blockRetries(userUuid: string) {
        await this.upsert(userUuid, "BLOCK_RETRY", "High risk score");
    }
    
    static async disableWallet(userUuid: string) {
        await this.upsert(userUuid, "DISABLE_WALLET", "Fraud risk");
    }

    static async requireManualReview(userUuid: string) {
        await this.upsert(userUuid, "MANUAL_REVIEW", "Risk threshold exceeded");
    }

    private static async upsert(
        userUuid: string,
        type: string,
        reason: string
      ) {
        await prisma.paymentRestriction.upsert({
          where: { userUuid_type: { userUuid, type } },
          update: { active: true, reason },
          create: { userUuid, type, reason },
        });
    }
}