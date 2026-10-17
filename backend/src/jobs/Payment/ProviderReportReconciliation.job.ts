import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { PaymentReconciliationService, type ProviderTxn } from "../../services/payment/PaymentReconciliation.service.ts";
import { DailyReconciliationService } from "../../services/payment/DailyReconciliation.service.ts";

dayjs.extend(utc);
dayjs.extend(timezone);

// Local hour from which a tenant's previous day is reconciled with the
// providers (after the stores' own daily reconciliation at 02:00)
const RECONCILE_FROM_LOCAL_HOUR = 3;
const SLACK_MS = 24 * 60 * 60 * 1000;

// Providers whose credentials are configured; the others are skipped
function configuredProviders() {
    const providers: string[] = [];
    if (process.env.STRIPE_SECRET_KEY) providers.push("STRIPE");
    if (process.env.EVC_PLUS_API_URL && process.env.EVC_PLUS_API_KEY) providers.push("EVC_PLUS");
    return providers;
}

// Runs hourly. Each tenant's previous calendar day, in the tenant's
// timezone (TenantSettings), is reconciled with each configured provider
// once local time passes 03:00, once per day. Provider reports are
// platform-wide, so each is fetched once per window and shared by the
// tenants on it.
export class ProviderReportReconciliationJob {
    static cronSchedule = "15 * * * *";

    static async run(now: Date = new Date(), providers: string[] = configuredProviders()) {
        if (providers.length === 0) return { successful: 0, failed: 0, skipped: 0 };

        const tenants = await prisma.tenant.findMany({
            where: { status: "ACTIVE" },
            select: { uuid: true, tenantSettingss: { select: { timezone: true } } },
        });

        const reports = new Map<string, Promise<ProviderTxn[]>>();
        const reportFor = (provider: string, start: Date, end: Date) => {
            const key = `${provider}:${start.toISOString()}:${end.toISOString()}`;
            if (!reports.has(key)) {
                reports.set(key, PaymentReconciliationService.fetchProviderReport(
                    provider, new Date(start.getTime() - SLACK_MS), new Date(end.getTime() + SLACK_MS)));
            }
            return reports.get(key)!;
        };

        let successful = 0;
        let failed = 0;
        let skipped = 0;

        for (const tenant of tenants) {
            const tz = DailyReconciliationService.safeTimezone(tenant.tenantSettingss[0]?.timezone);
            if (dayjs(now).tz(tz).hour() < RECONCILE_FROM_LOCAL_HOUR) {
                skipped++;
                continue;
            }
            const localDate = DailyReconciliationService.previousLocalDate(tz, now);
            const { start, end } = DailyReconciliationService.localDayWindow(tz, localDate);

            for (const provider of providers) {
                try {
                    const done = await prisma.paymentReconciliation.findUnique({
                        where: { tenantUuid_provider_periodStart: { tenantUuid: tenant.uuid, provider: provider as any, periodStart: start } },
                        select: { uuid: true },
                    });
                    if (done) {
                        skipped++;
                        continue;
                    }

                    const result = await PaymentReconciliationService.reconcile({
                        tenantUuid: tenant.uuid,
                        provider,
                        periodStart: start,
                        periodEnd: end,
                        transactions: await reportFor(provider, start, end),
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

        // Money at the provider that belongs to no payment of ours
        for (const [key, report] of reports) {
            try {
                const provider = key.split(":")[0];
                const orphans = await PaymentReconciliationService.unattributedTransactions(provider, await report);
                if (orphans.length > 0) {
                    logWithContext("error", "[ProviderReconciliation] Provider transactions with no payment of ours", {
                        provider,
                        count: orphans.length,
                        ids: orphans.slice(0, 20).map((t) => t.id),
                    });
                }
            } catch {
                // The fetch already failed and was counted per tenant
            }
        }

        if (successful > 0 || failed > 0) {
            logWithContext("info", "[ProviderReconciliation] Completed", { tenants: tenants.length, successful, failed, skipped });
        }
        return { successful, failed, skipped };
    }
}
