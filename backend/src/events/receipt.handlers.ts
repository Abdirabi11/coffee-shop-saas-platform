import { eventBus } from "./eventBus.ts";
import { logWithContext } from "../infrastructure/observability/Logger.ts";
import { ReceiptService } from "../services/payment/Receipt.service.ts";

// Emails the customer their receipt once a payment completes, through the
// outbox (EmailOutboxProcessorJob sends it). ReceiptService.issueOnPayment
// queues at most one per payment, so a repeated event is harmless.
const PAYMENT_COMPLETED_EVENTS = ["PAYMENT_CONFIRMED", "CASHIER_PAYMENT_COMPLETED"];

export function registerReceiptHandlers() {
    for (const event of PAYMENT_COMPLETED_EVENTS) {
        eventBus.on(event, async (payload) => {
            const paymentUuid = payload?.paymentUuid;
            if (!paymentUuid) return;
            try {
                const outcome = await ReceiptService.issueOnPayment(paymentUuid);
                logWithContext("info", "[Receipt] Payment receipt", { event, paymentUuid, outcome });
            } catch (error: any) {
                logWithContext("error", "[Receipt] Failed to queue payment receipt", { event, paymentUuid, error: error.message });
            }
        });
    }
}
