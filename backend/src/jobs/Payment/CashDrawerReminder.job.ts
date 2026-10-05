import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

export class CashDrawerReminderJob {
    static cronSchedule = "30 * * * *";
 
    static async run() {
        logWithContext("info", "[CashDrawerReminder] Starting");
    
        const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);
    
        const openDrawers = await prisma.cashDrawer.findMany({
            where: {
                status: "OPEN",
                sessionStart: { lt: cutoff },
            },
            select: {
                uuid: true,
                tenantUuid: true,
                storeUuid: true,
                terminalId: true,
                sessionStart: true,
            },
        });
    
        let alertsCreated = 0;
    
        for (const drawer of openDrawers) {
            const existingAlert = await prisma.adminAlert.findFirst({
                where: {
                    tenantUuid: drawer.tenantUuid,
                    storeUuid: drawer.storeUuid,
                    status: { in: ["ACTIVE", "ACKNOWLEDGED"] },
                    context: { path: ["subType"], equals: "DRAWER_OPEN_TOO_LONG" },
                    // Only checks alerts from today
                    createdAt: { gte: dayjs().startOf("day").toDate() },
                },
            });
        
            if (existingAlert) continue;
        
            const hoursOpen = Math.floor(
                (Date.now() - drawer.sessionStart.getTime()) / (60 * 60 * 1000)
            );
        
            await prisma.adminAlert.create({
                data: {
                    tenantUuid: drawer.tenantUuid,
                    storeUuid: drawer.storeUuid,
                    alertType: "ORDER_ISSUE",
                    category: "OPERATIONAL",
                    level: "WARNING",
                    priority: "MEDIUM",
                    source: "AUTOMATED_CHECK",
                    title: "Cash Drawer Open Too Long",
                    message: `Terminal ${drawer.terminalId} has been open for ${hoursOpen} hours`,
                    context: {
                        subType: "DRAWER_OPEN_TOO_LONG",
                        drawerUuid: drawer.uuid,
                        terminalId: drawer.terminalId,
                        sessionStart: drawer.sessionStart,
                        hoursOpen,
                    },
                },
            });
            alertsCreated++;
        }
    
        logWithContext("info", "[CashDrawerReminder] Completed", {
            openDrawers: openDrawers.length,
            alertsCreated,
        });
    
        return { openDrawers: openDrawers.length, alertsCreated };
    }
}
