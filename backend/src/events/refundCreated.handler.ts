import { PaymentRiskScoreService } from "../services/payment/paymentRiskScore.service.ts";


if (isAbusePattern) {
    await PaymentRiskScoreService.increase(
      userUuid,
      30,
      "REFUND_ABUSE"
    );
}