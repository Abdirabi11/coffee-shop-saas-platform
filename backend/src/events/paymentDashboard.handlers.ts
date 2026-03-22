import { bumpCacheVersion } from "../cache/cacheVersion.ts";
import { logWithContext } from "../infrastructure/observability/logger.ts";
import { StoreDailyMetricsService } from "../services/Dashboards/StoreDailyMetrics.service.ts";
import { ReceiptService } from "../services/payment/Receipt.service.ts";
import { eventBus } from "./eventBus.ts";

export function registerPaymentDashboardHandlers() {

    // PAYMENT CONFIRMED (provider flow — Stripe, EVC Plus, Wallet)
    eventBus.on("PAYMENT_CONFIRMED", async (payload) => {
        const { paymentUuid, tenantUuid, storeUuid, amount } = payload;
    
        try {
            //Increment store daily metrics (real-time)
            await StoreDailyMetricsService.recordPayment({
                tenantUuid,
                storeUuid,
                amount,
                paymentMethod: payload.paymentMethod ?? "STRIPE",
                paymentFlow: "PROVIDER",
            });
        
            //Bust dashboard caches so managers see updated revenue immediately
            await Promise.all([
                bumpCacheVersion(`store:${storeUuid}:dashboard`),
                bumpCacheVersion(`tenant:${tenantUuid}:dashboard`),
            ]);
        
            //Generate receipt
            await ReceiptService.generate(paymentUuid);
        } catch (error: any) {
            logWithContext("error", "[PaymentDashboard] PAYMENT_CONFIRMED handler failed", {
                paymentUuid,
                error: error.message,
            });
        }
    });
 
    //CASHIER PAYMENT COMPLETED (manual flow — cash, card terminal)
    eventBus.on("CASHIER_PAYMENT_COMPLETED", async (payload) => {
        const { paymentUuid, tenantUuid, storeUuid, amount, paymentMethod } =
        payload;
    
        try {
            //Increment store daily metrics (real-time)
            await StoreDailyMetricsService.recordPayment({
                tenantUuid,
                storeUuid,
                amount,
                paymentMethod,
                paymentFlow: "CASHIER",
            });
        
            await Promise.all([
                bumpCacheVersion(`store:${storeUuid}:dashboard`),
                bumpCacheVersion(`tenant:${tenantUuid}:dashboard`),
            ]);
    
            await ReceiptService.generate(paymentUuid);
        } catch (error: any) {
            logWithContext("error", "[PaymentDashboard] CASHIER_PAYMENT_COMPLETED handler failed", {
                paymentUuid,
                error: error.message,
            });
        }
    });
 
    //PAYMENT FAILED — increment failure counter, bust cache
    eventBus.on("PAYMENT_FAILED", async (payload) => {
        const { storeUuid, tenantUuid } = payload;
    
        try {
            if (storeUuid && tenantUuid) {
                await StoreDailyMetricsService.recordFailedPayment(tenantUuid, storeUuid);
                await bumpCacheVersion(`store:${storeUuid}:dashboard`);
            }
            if (tenantUuid) {
                await bumpCacheVersion(`tenant:${tenantUuid}:dashboard`);
            }
        } catch (error: any) {
            logWithContext("error", "[PaymentDashboard] PAYMENT_FAILED handler failed", {
                error: error.message,
            });
        }
    });
 
    // PAYMENT VOIDED — reverse the metrics, bust cache
    eventBus.on("PAYMENT_VOIDED", async (payload) => {
        const { tenantUuid, storeUuid } = payload;
    
        try {
            if (storeUuid && tenantUuid) {
                await StoreDailyMetricsService.recordVoid(
                    tenantUuid,
                    storeUuid,
                    payload.amount ?? 0
                );
                await bumpCacheVersion(`store:${storeUuid}:dashboard`);
            }
            if (tenantUuid) {
                await bumpCacheVersion(`tenant:${tenantUuid}:dashboard`);
            };
        } catch (error: any) {
            logWithContext("error", "[PaymentDashboard] PAYMENT_VOIDED handler failed", {
                error: error.message,
            });
        }
    });
 
    //REFUND COMPLETED — decrement revenue, bust cache
    eventBus.on("REFUND_COMPLETED", async (payload) => {
        const { storeUuid, tenantUuid, amount } = payload;
    
        try {
            if (storeUuid && tenantUuid && amount) {
                await StoreDailyMetricsService.recordRefund(tenantUuid, storeUuid, amount);
                await bumpCacheVersion(`store:${storeUuid}:dashboard`);
            }
            if (tenantUuid) {
                await bumpCacheVersion(`tenant:${tenantUuid}:dashboard`);
            }
        } catch (error: any) {
            logWithContext("error", "[PaymentDashboard] REFUND_COMPLETED handler failed", {
                error: error.message,
            });
        }
    });
 
    //PAYMENT RECONCILED — bust cache when polling job reconciles a payment
    eventBus.on("PAYMENT_RECONCILED", async (payload) => {
        const { storeUuid, tenantUuid } = payload;
    
        try {
            if (storeUuid) {
                await bumpCacheVersion(`store:${storeUuid}:dashboard`);
            }
            if (tenantUuid) {
                await bumpCacheVersion(`tenant:${tenantUuid}:dashboard`);
            }
        } catch (error: any) {
            logWithContext("error", "[PaymentDashboard] PAYMENT_RECONCILED handler failed", {
                error: error.message,
            });
        }
    });
 
    logWithContext("info", "[PaymentDashboard] Dashboard pipeline handlers registered");
}