import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { PaymentReconciliationService } from "../../services/payment/PaymentReconciliation.service.ts";


export class ProviderReportReconciliationJob {
    static cronSchedule = "0 2 * * *";
    
    static async run(date: Date = new Date()) {
        const periodStart = dayjs(date).subtract(1, "day").startOf("day").toDate();
        const periodEnd = dayjs(date).subtract(1, "day").endOf("day").toDate();
    
        logWithContext("info", "[ProviderReconciliation] Starting", {
            period: periodStart.toISOString(),
        });
    
        const providers = ["stripe", "evc_plus"];
    
        const tenants = await prisma.tenant.findMany({
            where: { status: "ACTIVE" },
            select: { uuid: true, name: true },
        });
    
        let successful = 0;
        let failed = 0;
    
        for (const tenant of tenants) {
            for (const provider of providers) {
                try {
                    const result = await PaymentReconciliationService.reconcile({
                        tenantUuid: tenant.uuid,
                        provider,
                        periodStart,
                        periodEnd,
                    });
            
                    if (result.hasDiscrepancy) {
                        logWithContext("warn", "[ProviderReconciliation] Discrepancy found", {
                            tenantUuid: tenant.uuid,
                            provider,
                            netVariance: result.netVariance,
                        });
                    }
        
                    successful++;
                } catch (error: any) {
                    failed++;
                    logWithContext("error", "[ProviderReconciliation] Failed", {
                        tenantUuid: tenant.uuid,
                        provider,
                        error: error.message,
                    });
                }
            }
        }
    
        logWithContext("info", "[ProviderReconciliation] Completed", {
            tenants: tenants.length,
            successful,
            failed,
        });
    
        return { successful, failed };
    }
}