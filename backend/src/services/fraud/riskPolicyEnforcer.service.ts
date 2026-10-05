import { AccountService } from "../account/account.service.ts";
import { PaymentRestrictionService } from "../payment/PaymentRestriction.service.ts";
import { PaymentRiskScoreService } from "../payment/paymentRiskScore.service.ts";

// Applies restrictions for the current risk score of one tenant membership.
// tenantUserUuid is the membership id (tenantUser.uuid), the same id
// PaymentRisk/PaymentRestriction store in their userUuid column.
export class RiskPolicyEnforcer{
    static async apply(input: { tenantUuid: string; tenantUserUuid: string }){
        const { tenantUuid, tenantUserUuid } = input;
        const score = await PaymentRiskScoreService.get(tenantUuid, tenantUserUuid);

        if (score >= 50) {
            await PaymentRestrictionService.blockRetries({
                tenantUuid,
                tenantUserUuid,
                reason: `Risk score ${score} — retries blocked`,
            });
        };

        if (score >= 70) {
            await PaymentRestrictionService.disableWallet({
                tenantUuid,
                tenantUserUuid,
                reason: `Risk score ${score} — wallet disabled`,
            });
            await PaymentRestrictionService.requireManualReview({
                tenantUuid,
                tenantUserUuid,
                reason: `Risk score ${score} — manual review required`,
            });
        };

        if (score >= 90) {
            await AccountService.lockPayments({
                tenantUserUuid,
                reason: `Risk score ${score} — payments locked`,
                lockedBy: "SYSTEM",
            });
        };
    }
};
