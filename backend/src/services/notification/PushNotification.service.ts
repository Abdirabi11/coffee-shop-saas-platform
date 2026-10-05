import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import prisma from "../../config/prisma.js"
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";

export class PushNotificationService{
    static async send(input: {
        userUuid: string;
        title: string;
        body: string;
        data?: Record<string, any>;
        priority?: "HIGH" | "NORMAL";
    }) {
        logWithContext("info", "[Push] Sending push notification", {
            userUuid: input.userUuid,
            title: input.title,
        });

        try {
            // Get user's device tokens
            const devices = await prisma.userDevice.findMany({
                where: {
                    userUuid: input.userUuid,
                    isActive: true,
                },
            });

            if (devices.length === 0) {
                logWithContext("warn", "[Push] No devices found for user", {
                    userUuid: input.userUuid,
                });
                return { success: false, reason: "NO_DEVICES" };
            };

            // TODO: Integrate with push provider (FCM, APNS, etc.)
            // For now, queue for later sending
            for (const device of devices) {
                await prisma.pushNotificationOutbox.create({
                    data: {
                        userUuid: input.userUuid,
                        deviceToken: device.pushToken!,
                        platform: device.platform,
                        title: input.title,
                        body: input.body,
                        data: input.data || {},
                        priority: input.priority || "NORMAL",
                        status: "PENDING",
                    },
                });
            }

            MetricsService.increment("push.sent", devices.length);

            return { success: true, deviceCount: devices.length };
        } catch (error: any) {
            logWithContext("error", "[Push] Failed to send push notification", {
                error: error.message,
                userUuid: input.userUuid,
            });
        
            MetricsService.increment("push.failed", 1);
        
            throw error;
        }
    }
}