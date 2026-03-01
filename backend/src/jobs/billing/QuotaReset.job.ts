import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { QuotaService } from "../../services/billing/Quota.service.ts";


export class QuotaResetJob {
  
    //Reset daily quotas
    //Run daily at 12:00 AM
    static async runDaily() {
        logWithContext("info", "[QuotaReset] Resetting daily quotas");

        try {
            await QuotaService.resetQuotas("DAILY");
        } catch (error: any) {
            logWithContext("error", "[QuotaReset] Daily reset failed", {
                error: error.message,
            });
        }
    }

    //Reset monthly quotas
    //Run on 1st of each month at 12:00 AM
    static async runMonthly() {
        logWithContext("info", "[QuotaReset] Resetting monthly quotas");

        try {
            await QuotaService.resetQuotas("MONTHLY");
        } catch (error: any) {
            logWithContext("error", "[QuotaReset] Monthly reset failed", {
                error: error.message,
            });
        }
    }

    //Reset yearly quotas
    //Run on January 1st at 12:00 AM
    static async runYearly() {
        logWithContext("info", "[QuotaReset] Resetting yearly quotas");

        try {
            await QuotaService.resetQuotas("YEARLY");
        } catch (error: any) {
            logWithContext("error", "[QuotaReset] Yearly reset failed", {
                error: error.message,
            });
        }
    }
}