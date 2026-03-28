import prisma from "../../config/prisma.ts"
import { RefundService } from "../../services/payment/Refund.service.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";

export class RefundProcessorJob {
  static cronSchedule = "*/10 * * * *";

    static async run() {
        logWithContext("info", "[RefundProcessor] Starting");
    
        const pendingRefunds = await prisma.refund.findMany({
            where: { status: "REQUESTED" },
            orderBy: { createdAt: "asc" },
            take: 20,
        });
    
        if (pendingRefunds.length === 0) {
            logWithContext("info", "[RefundProcessor] No pending refunds");
            return { processed: 0, failed: 0 };
        }
    
        let processed = 0;
        let failed = 0;
    
        for (const refund of pendingRefunds) {
            try {
                await RefundService.processRefund(refund.uuid);    
                processed++;
            } catch (error: any) {
                failed++;
                logWithContext("error", "[RefundProcessor] Failed", {
                    refundUuid: refund.uuid,
                    orderUuid: refund.orderUuid,
                    error: error.message,
                });
            }
        }
    
        logWithContext("info", "[RefundProcessor] Completed", { processed, failed });
        return { processed, failed };
    }
}