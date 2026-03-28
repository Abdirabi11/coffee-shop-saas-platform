import dayjs from "dayjs";
import { PaymentReconciliationService } from "../../services/payment/PaymentReconciliation.service.ts";

export class ProviderReportReconciliation{
  static async run(date: Date = new Date()) {
    const periodStart = dayjs(date).subtract(1, "day").startOf("day").toDate();
    const periodEnd = dayjs(date).subtract(1, "day").endOf("day").toDate();

    console.log(`[PaymentReconciliation] Running for ${periodStart.toISOString()}`);

    const providers = ["stripe", "evc_plus"];

    let successful = 0;
    let failed = 0;

    for (const provider of providers) {
      try {
        const result= await PaymentReconciliationService.reconcile({
          provider,
          periodStart,
          periodEnd,
        });

        if (result.hasDiscrepancy) {
          console.warn(`[ProviderReportReconciliation] ${provider}: Found discrepancy of ${result.netVariance / 100}`);
        } else {
          console.log(`[ProviderReportReconciliation] ${provider}: Reconciled successfully`);
        }

        successful++;
      } catch (error: any) {
        console.error(`[PaymentReconciliation] Failed for ${provider}:`, error.message);
        failed++;
      }
    }

    console.log("[PaymentReconciliation] Completed");
  }
};

