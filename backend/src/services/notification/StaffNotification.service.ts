import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";

export class StaffNotificationService {
    //Alert kitchen staff
    static async alertStaff(
        storeUuid: string,
        alert: {
            type: string;
            orderUuid: string;
            orderNumber: string;
            minutesDelayed?: number;
        }
    ) {
        logWithContext("info", "[StaffNotification] Alerting staff", {
            storeUuid,
            alertType: alert.type,
        });
    
        try {
            // Get staff for this store
            const staff = await prisma.tenantUser.findMany({
                where: {
                    role: { in: ["MANAGER", "CASHIER"] },
                    stores: {
                    some: {
                        storeUuid,
                    },
                    },
                    isActive: true,
                },
                include: {
                    user: true,
                },
            });
    
            // Send push notifications to all staff
            for (const staffMember of staff) {
                if (staffMember.user.uuid) {
                    await PushNotificationService.send({
                        userUuid: staffMember.user.uuid,
                        title: this.getAlertTitle(alert.type),
                        body: this.getAlertBody(alert),
                        data: {
                            type: alert.type,
                            orderUuid: alert.orderUuid,
                            storeUuid,
                        },
                        priority: "HIGH",
                    });
                }
            };
    
            logWithContext("info", "[StaffNotification] Staff alerted", {
                count: staff.length,
            });
        } catch (error: any) {
            logWithContext("error", "[StaffNotification] Failed to alert staff", {
                error: error.message,
            });
        }
    }
  
    private static getAlertTitle(type: string): string {
        const titles: Record<string, string> = {
            ORDER_DELAY: "⚠️ Order Delayed",
            ORDER_STUCK: "🚨 Order Stuck",
            INVENTORY_LOW: "📦 Low Inventory",
        };
    
        return titles[type] || "Alert";
    }
  
    private static getAlertBody(alert: any): string {
        if (alert.type === "ORDER_DELAY") {
            return `Order #${alert.orderNumber} has been preparing for ${alert.minutesDelayed} minutes`;
        }
    
        return `Order #${alert.orderNumber} requires attention`;
    }
}
  