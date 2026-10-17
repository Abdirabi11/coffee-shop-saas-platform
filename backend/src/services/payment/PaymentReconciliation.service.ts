import type { PaymentProvider } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import Stripe from "stripe";
import axios from "axios";

interface ReconciliationResult {
    hasDiscrepancy: boolean;
    paymentVariance: number;
    refundVariance: number;
    netVariance: number;
    providerFees: number;
    missingInOurSystem: string[];
    missingInProvider: string[];
}

// One money movement as the provider reports it, in minor units. amount is
// positive for both kinds; fee is what the provider kept; net is what it
// moved into (payment) or out of (refund, negative) our balance.
export interface ProviderTxn {
    id: string;
    kind: "payment" | "refund";
    paymentRef: string | null; // our Payment.providerRef (Stripe: payment intent)
    amount: number;
    fee: number;
    net: number;
    createdAt: Date;
}

const RECONCILABLE_PROVIDERS = new Set(["STRIPE", "EVC_PLUS"]);

// Variance under this (minor units) is rounding, not a problem
const VARIANCE_TOLERANCE = 100;

// Provider reports are fetched this much wider than the day, so a payment
// we recorded just before midnight and the provider just after (or the
// other way) is matched instead of reported missing on both sides
const MATCH_SLACK_MS = 24 * 60 * 60 * 1000;

export class PaymentReconciliationService {
    // Reconciles one tenant's payments with a provider for a period.
    //
    //   ours      payments collected in the period (incl. later refunded)
    //             and refunds completed in it
    //   provider  the provider's charges for those same payments, wherever
    //             they fall around midnight, plus charges in the period we
    //             don't have as collected; its refunds in the period; the
    //             fees it took and the net it kept
    //
    // The fee is not variance: the check is
    //     provider net == our gross - our refunds - provider fees
    // and gross and refunds are compared on their own as well.
    //
    // `transactions` lets the caller pass a provider report it already
    // fetched (one platform-wide report serves every tenant).
    static async reconcile(input: {
        tenantUuid: string;
        storeUuid?: string;
        provider: string;
        periodStart: Date;
        periodEnd: Date; // exclusive
        transactions?: ProviderTxn[];
    }): Promise<ReconciliationResult> {
        const provider = input.provider.toUpperCase() as PaymentProvider;
        if (!RECONCILABLE_PROVIDERS.has(provider)) {
            throw new Error(`PROVIDER_RECONCILIATION_NOT_SUPPORTED: ${input.provider}`);
        }
        const window = { gte: input.periodStart, lt: input.periodEnd };
        const inWindow = (d: Date) => d >= input.periodStart && d < input.periodEnd;

        const ourPayments = await prisma.payment.findMany({
            where: {
                tenantUuid: input.tenantUuid,
                ...(input.storeUuid && { storeUuid: input.storeUuid }),
                provider,
                paymentFlow: "PROVIDER",
                paidAt: window,
                status: { in: ["PAID", "COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED"] },
            },
            select: { uuid: true, amount: true, providerRef: true },
        });
        const ourRefunds = await prisma.refund.findMany({
            where: {
                tenantUuid: input.tenantUuid,
                ...(input.storeUuid && { storeUuid: input.storeUuid }),
                provider,
                processedAt: window,
                status: "COMPLETED",
            },
            select: { amount: true },
        });

        const ourPaymentTotal = ourPayments.reduce((sum, p) => sum + p.amount, 0);
        const ourRefundTotal = ourRefunds.reduce((sum, r) => sum + r.amount, 0);

        const report = input.transactions
            ?? await this.fetchProviderReport(provider, new Date(input.periodStart.getTime() - MATCH_SLACK_MS), new Date(input.periodEnd.getTime() + MATCH_SLACK_MS));
        const txns = await this.tenantTransactions(input.tenantUuid, provider, report, input.storeUuid);

        // Provider charges: those for our payments (matched by reference,
        // any time in the widened report), and unmatched ones in the period
        const ourRefs = new Set(ourPayments.map((p) => p.providerRef).filter(Boolean) as string[]);
        const providerPayments = txns.filter((t) => t.kind === "payment" && (t.paymentRef && ourRefs.has(t.paymentRef) || inWindow(t.createdAt)));
        const providerRefunds = txns.filter((t) => t.kind === "refund" && inWindow(t.createdAt));

        const providerPaymentTotal = providerPayments.reduce((sum, t) => sum + t.amount, 0);
        const providerRefundTotal = providerRefunds.reduce((sum, t) => sum + t.amount, 0);
        const providerFeeTotal = [...providerPayments, ...providerRefunds].reduce((sum, t) => sum + t.fee, 0);
        const providerNetTotal = [...providerPayments, ...providerRefunds].reduce((sum, t) => sum + t.net, 0);

        const expectedNetTotal = ourPaymentTotal - ourRefundTotal - providerFeeTotal;
        const ourNetTotal = ourPaymentTotal - ourRefundTotal;
        const paymentAmountVariance = ourPaymentTotal - providerPaymentTotal;
        const refundAmountVariance = ourRefundTotal - providerRefundTotal;
        const netVariance = expectedNetTotal - providerNetTotal;

        const providerRefs = new Set(txns.filter((t) => t.kind === "payment").map((t) => t.paymentRef).filter(Boolean));
        const missingInProvider = ourPayments
            .filter((p) => p.providerRef && !providerRefs.has(p.providerRef))
            .map((p) => p.uuid);
        const missingInOurSystem = providerPayments
            .filter((t) => !t.paymentRef || !ourRefs.has(t.paymentRef))
            .map((t) => t.paymentRef ?? t.id);

        const hasDiscrepancy =
            Math.abs(paymentAmountVariance) > VARIANCE_TOLERANCE ||
            Math.abs(refundAmountVariance) > VARIANCE_TOLERANCE ||
            Math.abs(netVariance) > VARIANCE_TOLERANCE ||
            missingInOurSystem.length > 0 ||
            missingInProvider.length > 0;

        const figures = {
            storeUuid: input.storeUuid,
            periodEnd: input.periodEnd,

            ourPaymentCount: ourPayments.length,
            ourPaymentTotal,
            ourRefundCount: ourRefunds.length,
            ourRefundTotal,
            ourNetTotal,

            providerPaymentCount: providerPayments.length,
            providerPaymentTotal,
            providerRefundCount: providerRefunds.length,
            providerRefundTotal,
            providerNetTotal,
            providerFeeTotal,
            expectedNetTotal,

            paymentCountVariance: ourPayments.length - providerPayments.length,
            paymentAmountVariance,
            refundCountVariance: ourRefunds.length - providerRefunds.length,
            refundAmountVariance,
            netVariance,
            hasDiscrepancy,
            missingInOurSystem,
            missingInProvider,

            status: hasDiscrepancy ? "HAS_DISCREPANCY" as const : "RECONCILED" as const,
            providerReport: { transactions: txns.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() })) },
            discrepancyDetails: hasDiscrepancy
                ? {
                    paymentVariance: paymentAmountVariance,
                    refundVariance: refundAmountVariance,
                    netVariance,
                    providerFees: providerFeeTotal,
                    missingCount: missingInOurSystem.length + missingInProvider.length,
                }
                : undefined,
        };

        // Re-running a period replaces its row
        await prisma.paymentReconciliation.upsert({
            where: {
                tenantUuid_provider_periodStart: { tenantUuid: input.tenantUuid, provider, periodStart: input.periodStart },
            },
            update: figures,
            create: { ...figures, tenantUuid: input.tenantUuid, provider, periodStart: input.periodStart },
        });

        if (hasDiscrepancy) {
            await prisma.adminAlert.create({
                data: {
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    alertType: "PAYMENT_FAILED", // Valid AlertType enum value
                    category: "FINANCIAL",
                    level: "WARNING",
                    priority: "HIGH",
                    source: "AUTOMATED_CHECK",
                    title: "Payment Reconciliation Discrepancy",
                    message: `Reconciliation for ${provider} found ${netVariance / 100} net variance (fees of ${providerFeeTotal / 100} accounted for)`,
                    context: {
                        type: "RECONCILIATION_MISMATCH",
                        provider,
                        periodStart: input.periodStart.toISOString(),
                        periodEnd: input.periodEnd.toISOString(),
                        netVariance,
                        paymentVariance: paymentAmountVariance,
                        refundVariance: refundAmountVariance,
                        providerFees: providerFeeTotal,
                        missingTransactions: missingInOurSystem.length + missingInProvider.length,
                    },
                },
            });
        }

        logWithContext(hasDiscrepancy ? "warn" : "info", "[Reconciliation] Completed", {
            provider,
            tenantUuid: input.tenantUuid,
            hasDiscrepancy,
            netVariance,
            providerFees: providerFeeTotal,
            missingInOurSystem: missingInOurSystem.length,
            missingInProvider: missingInProvider.length,
        });

        return {
            hasDiscrepancy,
            paymentVariance: paymentAmountVariance,
            refundVariance: refundAmountVariance,
            netVariance,
            providerFees: providerFeeTotal,
            missingInOurSystem,
            missingInProvider,
        };
    }

    // The provider's account is the platform's, shared by every tenant: a
    // transaction belongs to the tenant (and store) whose payment it is for.
    // Ones for no payment of ours at all are left to the caller to report
    // (unattributedTransactions).
    private static async tenantTransactions(tenantUuid: string, provider: PaymentProvider, txns: ProviderTxn[], storeUuid?: string) {
        const owners = await this.paymentOwners(provider, txns);
        return txns.filter((t) => {
            const owner = t.paymentRef ? owners.get(t.paymentRef) : undefined;
            return owner?.tenantUuid === tenantUuid && (!storeUuid || owner.storeUuid === storeUuid);
        });
    }

    static async unattributedTransactions(provider: string, txns: ProviderTxn[]) {
        const owners = await this.paymentOwners(provider.toUpperCase() as PaymentProvider, txns);
        return txns.filter((t) => !t.paymentRef || !owners.has(t.paymentRef));
    }

    private static async paymentOwners(provider: PaymentProvider, txns: ProviderTxn[]) {
        const refs = [...new Set(txns.map((t) => t.paymentRef).filter(Boolean) as string[])];
        const payments = refs.length === 0 ? [] : await prisma.payment.findMany({
            where: { provider, providerRef: { in: refs } },
            select: { providerRef: true, tenantUuid: true, storeUuid: true },
        });
        return new Map(payments.map((p) => [p.providerRef!, { tenantUuid: p.tenantUuid, storeUuid: p.storeUuid }]));
    }

    // Fetch a provider's transactions for [periodStart, periodEnd)
    static async fetchProviderReport(provider: string, periodStart: Date, periodEnd: Date): Promise<ProviderTxn[]> {
        switch (provider.toUpperCase()) {
            case "STRIPE":
                return this.fetchStripeReport(periodStart, periodEnd);
            case "EVC_PLUS":
                return this.fetchEVCReport(periodStart, periodEnd);
            default:
                throw new Error(`PROVIDER_RECONCILIATION_NOT_SUPPORTED: ${provider}`);
        }
    }

    // Balance transactions of the period, every page. Charges ("charge",
    // "payment") and refunds ("refund", "payment_refund"); each one's
    // source is expanded to find the payment intent it belongs to, which is
    // what Payment.providerRef holds. Stripe reports refunds as negative
    // amounts; here they're positive with a negative net.
    private static async fetchStripeReport(periodStart: Date, periodEnd: Date): Promise<ProviderTxn[]> {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
        const txns: ProviderTxn[] = [];

        const list = stripe.balanceTransactions.list({
            created: {
                gte: Math.floor(periodStart.getTime() / 1000),
                lt: Math.floor(periodEnd.getTime() / 1000),
            },
            limit: 100,
            expand: ["data.source"],
        });
        for await (const t of list) {
            const kind = t.type === "charge" || t.type === "payment" ? "payment"
                : t.type === "refund" || t.type === "payment_refund" ? "refund"
                : null;
            if (!kind) continue; // payouts, Stripe's own fees, adjustments

            const source = t.source as { id?: string; payment_intent?: string | { id: string } | null } | string | null;
            const intent = typeof source === "object" && source
                ? (typeof source.payment_intent === "string" ? source.payment_intent : source.payment_intent?.id ?? null)
                : null;

            txns.push({
                id: t.id,
                kind,
                paymentRef: intent,
                amount: Math.abs(t.amount),
                fee: t.fee,
                net: t.net,
                createdAt: new Date(t.created * 1000),
            });
        }
        return txns;
    }

    // TODO: verify against EVC Plus's report API (field names, and amounts
    // in major units, hence x100)
    private static async fetchEVCReport(periodStart: Date, periodEnd: Date): Promise<ProviderTxn[]> {
        const response = await axios.post(
            `${process.env.EVC_PLUS_API_URL}/reports/transactions`,
            {
                merchant_uuid: process.env.EVC_PLUS_MERCHANT_UUID,
                start_date: periodStart.toISOString(),
                end_date: periodEnd.toISOString(),
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.EVC_PLUS_API_KEY}`,
                },
            }
        );

        const txns: ProviderTxn[] = [];
        for (const t of response.data?.transactions ?? []) {
            if (t.type !== "payment" && t.type !== "refund") continue;
            const amount = Math.round(Math.abs(t.amount) * 100);
            const fee = Math.round((t.fee ?? 0) * 100);
            txns.push({
                id: String(t.id),
                kind: t.type,
                paymentRef: t.reference ?? t.id ?? null,
                amount,
                fee,
                net: t.type === "payment" ? amount - fee : -amount - fee,
                createdAt: new Date(t.created_at ?? t.date ?? periodStart),
            });
        }
        return txns;
    }
}
