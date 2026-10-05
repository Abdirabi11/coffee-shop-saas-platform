import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";


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

// const client = process.env.TWILIO_SID
//   ? twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN)
//   : null;

// export class SMSService {
//   static async send(input: { to: string; message: string; priority?: string }) {
//     // Dev mode: log to console
//     if (!client) {
//       console.log(`[SMS] 📱 ${input.to}: ${input.message}`);
//       await prisma.smsOutbox.create({
//         data: { to: input.to, message: input.message, status: "LOGGED" },
//       });
//       return { success: true };
//     }

//     // Production: send via Twilio
//     await client.messages.create({
//       to: input.to,
//       from: process.env.TWILIO_PHONE_NUMBER!,
//       body: input.message,
//     });

//     await prisma.smsOutbox.create({
//       data: { to: input.to, message: input.message, status: "SENT", sentAt: new Date() },
//     });

//     return { success: true };
//   }
// }