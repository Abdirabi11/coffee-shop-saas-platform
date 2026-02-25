import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";

export class SMSService {
    //Send SMS notification
    static async send(input: {
        to: string;
        message: string;
        priority?: "HIGH" | "NORMAL" | "LOW";
    }) {
        logWithContext("info", "[SMS] Sending SMS", {
            to: input.to,
            messageLength: input.message.length,
        });

        try {
            // TODO: Integrate with SMS provider (Twilio, AWS SNS, etc.)
            // For now, just log
            console.log(`[SMS] To: ${input.to}, Message: ${input.message}`);

            // Queue for later sending
            await prisma.smsOutbox.create({
                data: {
                    to: input.to,
                    message: input.message,
                    priority: input.priority || "NORMAL",
                    status: "PENDING",
                },
            });

            MetricsService.increment("sms.sent", 1);

            return { success: true };
        } catch (error: any) {
            logWithContext("error", "[SMS] Failed to send SMS", {
                error: error.message,
                to: input.to,
            });
        
            MetricsService.increment("sms.failed", 1);
        
            throw error;
        }
    }
}