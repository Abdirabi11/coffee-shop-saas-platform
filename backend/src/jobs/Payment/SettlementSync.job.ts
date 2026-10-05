import dayjs from "dayjs";
import axios from "axios";
import Stripe from "stripe";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { SettlementService } from "../../services/payment/Settlement.service.ts";


export class SettlementSyncJob {
    static cronSchedule = "0 6 * * *";
    
    static async run() {
        const startTime = Date.now();
        logWithContext("info", "[SettlementSync] Starting");
    
        let settled = 0;
        let failed = 0;
    
        try {
            // Sync Stripe settlements
            const stripeResult = await this.syncStripe();
            settled += stripeResult.settled;
            failed += stripeResult.failed;
        
            // Sync EVC Plus settlements
            const evcResult = await this.syncEVC();
            settled += evcResult.settled;
            failed += evcResult.failed;
        
            const duration = Date.now() - startTime;
            logWithContext("info", "[SettlementSync] Completed", {
                settled,
                failed,
                durationMs: duration,
            });
        
            MetricsService.increment("settlement.synced", settled);
        
            return { settled, failed };
        } catch (error: any) {
            logWithContext("error", "[SettlementSync] Fatal error", {
                error: error.message,
            });
            throw error;
        }
    }
 
    //Stripe payout sync 
    private static async syncStripe() {
        let settled = 0;
        let failed = 0;
    
        try {
            const Stripe = require("stripe");
            const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        
            // Get recent payouts (last 7 days)
            const payouts = await stripe.payouts.list({
                created: {
                    gte: Math.floor(dayjs().subtract(7, "day").valueOf() / 1000),
                },
                status: "paid",
                limit: 100,
            });
        
            for (const payout of payouts.data) {
                try {
                    // Get balance transactions included in this payout
                    const balanceTransactions = await stripe.balanceTransactions.list({
                        payout: payout.id,
                        limit: 100,
                    });
        
                    for (const txn of balanceTransactions.data) {
                        if (txn.type !== "charge") continue;
            
                        // txn.source is the charge ID, but we store payment_intent ID
                        // We need to find the charge to get the payment_intent
                        const charge = await stripe.charges.retrieve(txn.source);
            
                        if (charge.payment_intent) {
                            await SettlementService.markSettled({
                                providerRef: charge.payment_intent,
                                providerPayoutId: payout.id,
                                settledAt: new Date(payout.arrival_date * 1000),
                                netAmount: txn.net, // Amount after Stripe fees
                                fee: txn.fee,
                            });
                            settled++;
                        }
                    }
                } catch (payoutError: any) {
                    failed++;
                    logWithContext("warn", "[SettlementSync] Stripe payout sync failed", {
                        payoutId: payout.id,
                        error: payoutError.message,
                    });
                }
            }
        } catch (error: any) {
            logWithContext("error", "[SettlementSync] Stripe sync failed", {
                error: error.message,
            });
        }
    
        return { settled, failed };
    }
 
    //EVC Plus settlement sync
    private static async syncEVC() {
        let settled = 0;
        let failed = 0;
    
        try {
    
            const response = await axios.get(
                `${process.env.EVC_PLUS_API_URL}/settlements`,
                {
                    params: {
                        merchant_uuid: process.env.EVC_PLUS_MERCHANT_UUID,
                        from: dayjs().subtract(7, "day").toISOString(),
                        to: new Date().toISOString(),
                        status: "completed",
                    },
                    headers: {
                        Authorization: `Bearer ${process.env.EVC_PLUS_API_KEY}`,
                    },
                }
            );
        
            const settlements = response.data?.settlements ?? [];
    
            for (const s of settlements) {
                try {
                    await SettlementService.markSettled({
                        providerRef: s.transaction_id,
                        providerPayoutId: s.settlement_id,
                        settledAt: new Date(s.settled_at),
                        netAmount: Math.round(s.net_amount * 100), // Convert to cents
                        fee: Math.round(s.fee * 100),
                    });
                    settled++;
                } catch (err: any) {
                    failed++;
                    logWithContext("warn", "[SettlementSync] EVC settlement sync failed", {
                        settlementId: s.settlement_id,
                        error: err.message,
                    });
                }
            }
        } catch (error: any) {
            logWithContext("error", "[SettlementSync] EVC sync failed", {
                error: error.message,
            });
        }
    
        return { settled, failed };
    }
}