import { PaymentRiskScoreService } from "../../services/payment/paymentRiskScore.service.ts";


export class RiskScoreDecayJob {
    static async run() {
      console.log("[RiskScoreDecay] Starting...");
      await PaymentRiskScoreService.decayScores();
      console.log("[RiskScoreDecay] Completed");
    }
}