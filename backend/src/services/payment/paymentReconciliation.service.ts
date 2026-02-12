import prisma from "../../config/prisma.ts"

interface ReconciliationResult {
    hasDiscrepancy: boolean;
    paymentVariance: number;
    refundVariance: number;
    netVariance: number;
    missingInOurSystem: string[];
    missingInProvider: string[];
}

export class PaymentReconciliationService {
    //Reconcile payments with provider for a period
    static async reconcile(input: {
        tenantUuid?: string;
        storeUuid?: string;
        provider: string;
        periodStart: Date;
        periodEnd: Date;
    }): Promise<ReconciliationResult> {
        console.log(`[PaymentReconciliation] Starting reconciliation for ${input.provider}`)

        const ourPayments= await prisma.payment.findMany({
            where: {
                ...(input.tenantUuid && { tenantUuid: input.tenantUuid }),
                ...(input.storeUuid && { storeUuid: input.storeUuid }),
                provider: input.provider.toUpperCase(),
                paymentFlow: "PROVIDER",
                paidAt: {
                gte: input.periodStart,
                lte: input.periodEnd,
                },
                status: { in: ["PAID", "REFUNDED", "PARTIALLY_REFUNDED"] },
            },
        });

        const ourRefunds = await prisma.refund.findMany({
            where: {
              ...(input.tenantUuid && { tenantUuid: input.tenantUuid }),
              ...(input.storeUuid && { storeUuid: input.storeUuid }),
              provider: input.provider.toUpperCase(),
              processedAt: {
                gte: input.periodStart,
                lte: input.periodEnd,
              },
              status: "COMPLETED",
            },
        });

        // Calculate our totals
        const ourPaymentTotal = ourPayments.reduce((sum, p) => sum + p.amount, 0);
        const ourRefundTotal = ourRefunds.reduce((sum, r) => sum + r.amount, 0);
        const ourNetTotal = ourPaymentTotal - ourRefundTotal;

        //Fetch provider report
        const providerReport = await this.fetchProviderReport(
            input.provider,
            input.periodStart,
            input.periodEnd
        );

        //Compare and identify discrepancies
        const paymentCountVariance = ourPayments.length - providerReport.paymentCount;
        const paymentAmountVariance = ourPaymentTotal - providerReport.paymentTotal;
        const refundCountVariance = ourRefunds.length - providerReport.refundCount;
        const refundAmountVariance = ourRefundTotal - providerReport.refundTotal;
        const netVariance = ourNetTotal - providerReport.netTotal;

        //Find missing transactions
        const ourProviderRefs = new Set(ourPayments.map(p => p.providerRef).filter(Boolean));
        const providerRefs = new Set(providerReport.transactions.map((t: any) => t.id));

        const missingInOurSystem = providerReport.transactions
          .filter((t: any) => !ourProviderRefs.has(t.id))
          .map((t: any) => t.id);

        const missingInProvider = ourPayments
          .filter(p => p.providerRef && !providerRefs.has(p.providerRef))
          .map(p => p.uuid);

        const hasDiscrepancy =
            Math.abs(paymentAmountVariance) > 100 ||
            Math.abs(refundAmountVariance) > 100 ||
            missingInOurSystem.length > 0 ||
            missingInProvider.length > 0;
    
        await prisma.paymentReconciliation.create({
            data: {
                tenantUuid: input.tenantUuid || "SYSTEM",
                storeUuid: input.storeUuid,
                periodStart: input.periodStart,
                periodEnd: input.periodEnd,
                provider: input.provider.toUpperCase(),
                ourPaymentCount: ourPayments.length,
                ourPaymentTotal,
                ourRefundCount: ourRefunds.length,
                ourRefundTotal,
                ourNetTotal,
                // Provider records
                providerPaymentCount: providerReport.paymentCount,
                providerPaymentTotal: providerReport.paymentTotal,
                providerRefundCount: providerReport.refundCount,
                providerRefundTotal: providerReport.refundTotal,
                providerNetTotal: providerReport.netTotal,
                // Variances
                paymentCountVariance,
                paymentAmountVariance,
                refundCountVariance,
                refundAmountVariance,
                netVariance,
                hasDiscrepancy,
                missingInOurSystem,
                missingInProvider,
            
                status: hasDiscrepancy ? "HAS_DISCREPANCY" : "RECONCILED",
                providerReport: providerReport.raw,
            
                discrepancyDetails: hasDiscrepancy ? {
                    paymentVariance: paymentAmountVariance,
                    refundVariance: refundAmountVariance,
                    netVariance,
                    missingCount: missingInOurSystem.length + missingInProvider.length,
                } : null,
            },
        });

        //Create alert if discrepancy found
        if (hasDiscrepancy && input.tenantUuid) {
            await prisma.adminAlert.create({
                data:{
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    alertType: "PAYMENT_RECONCILIATION_MISMATCH",
                    category: "FINANCIAL",
                    level: "WARNING",
                    priority: "HIGH",
                    title: "Payment Reconciliation Discrepancy",
                    message: `Reconciliation for ${input.provider} found ${Math.abs(netVariance) / 100} variance`,
                    context: {
                        provider: input.provider,
                        periodStart: input.periodStart,
                        periodEnd: input.periodEnd,
                        netVariance,
                        missingTransactions: missingInOurSystem.length + missingInProvider.length,
                    },
                },
            });
        }
        console.log(`[PaymentReconciliation] Completed: ${hasDiscrepancy ? "HAS DISCREPANCY" : "OK"}`);

        return {
            hasDiscrepancy,
            paymentVariance: paymentAmountVariance,
            refundVariance: refundAmountVariance,
            netVariance,
            missingInOurSystem,
            missingInProvider,
        };
    }

    //Fetch report from payment provider
    private static async fetchProviderReport(
        provider: string,
        periodStart: Date,
        periodEnd: Date
    ): Promise<any> {
        switch (provider.toLowerCase()) {
            case "stripe":
              return this.fetchStripeReport(periodStart, periodEnd);
            
            case "evc_plus":
              return this.fetchEVCReport(periodStart, periodEnd);
            
            default:
              throw new Error(`Provider ${provider} does not support reconciliation`);
        }
    }

    private static async fetchStripeReport(periodStart: Date, periodEnd: Date) {
        const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

        const transactions = await stripe.balanceTransactions.list({
            created: {
                gte: Math.floor(periodStart.getTime() / 1000),
                lte: Math.floor(periodEnd.getTime() / 1000),
            },
            limit: 100,
        });
    
        const payments = transactions.data.filter((t: any) => t.type === "charge");
        const refunds = transactions.data.filter((t: any) => t.type === "refund");
    
        return {
            paymentCount: payments.length,
            paymentTotal: payments.reduce((sum: number, p: any) => sum + p.amount, 0),
            refundCount: refunds.length,
            refundTotal: refunds.reduce((sum: number, r: any) => sum + r.amount, 0),
            netTotal: payments.reduce((sum: number, p: any) => sum + p.net, 0),
            transactions: transactions.data,
            raw: transactions,
        };
    }

    //Fetch EVC Plus transactions
    private static async fetchEVCReport(periodStart: Date, periodEnd: Date) {
        const axios = require("axios");
        
        const response = await axios.post(
            `${process.env.EVC_PLUS_API_URL}/reports/transactions`,
            {
                merchant_uuid: process.env.EVC_PLUS_MERCHANT_UUID,
                start_date: periodStart.toISOString(),
                end_date: periodEnd.toISOString(),
            },
            {
                headers: {
                    "Authorization": `Bearer ${process.env.EVC_PLUS_API_KEY}`,
                },
            }
        );
    
        const transactions = response.data.transactions;
        const payments = transactions.filter((t: any) => t.type === "payment");
        const refunds = transactions.filter((t: any) => t.type === "refund");
    
        return {
            paymentCount: payments.length,
            paymentTotal: payments.reduce((sum: number, p: any) => sum + (p.amount * 100), 0), // Convert to cents
            refundCount: refunds.length,
            refundTotal: refunds.reduce((sum: number, r: any) => sum + (r.amount * 100), 0),
            netTotal: (payments.reduce((sum: number, p: any) => sum + p.amount, 0) - 
                refunds.reduce((sum: number, r: any) => sum + r.amount, 0)) * 100,
            transactions,
            raw: response.data,
        };
    }
}