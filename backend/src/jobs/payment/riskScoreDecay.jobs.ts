import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { PaymentRiskScoreService } from "../../services/payment/paymentRiskScore.service.ts";


export class RiskScoreDecayJob {
  static cronSchedule = "0 3 * * *";
 
  static async run() {
    logWithContext("info", "[RiskScoreDecay] Starting");
    await PaymentRiskScoreService.decayScores();
    logWithContext("info", "[RiskScoreDecay] Completed");
  }
}