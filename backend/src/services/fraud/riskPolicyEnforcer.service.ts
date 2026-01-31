import { PaymentRestrictionService } from "../payment/PaymentRestriction.service.ts";
import { PaymentRiskScoreService } from "../payment/paymentRiskScore.service.ts";

export class RiskPolicyEnforcer{
    static async apply(userUuid: string){
        const score= await PaymentRiskScoreService.get(userUuid)

        if (score >= 50) {
            await PaymentRestrictionService.blockRetries(userUuid);
        };
      
        if (score >= 70) {
            await PaymentRestrictionService.disableWallet(userUuid);
            await PaymentRestrictionService.requireManualReview(userUuid);
        };
      
        if (score >= 90) {
            await AccountService.lockPayments(userUuid);
        };
    }
};