import prisma from "../../config/prisma.ts"

export class CashDrawerReminderJob {
    static async run() {
        // Find drawers open for more than 12 hours
        const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);
  
        const openDrawers = await prisma.cashDrawer.findMany({
            where: {
                status: "OPEN",
                sessionStart: { lt: cutoff },
            },
            include: {
                store: true,
            },
        });
    
        for (const drawer of openDrawers) {
            await prisma.adminAlert.create({
                data: {
                    tenantUuid: drawer.tenantUuid,
                    storeUuid: drawer.storeUuid,
                    alertType: "DRAWER_OPEN_TOO_LONG",
                    category: "OPERATIONAL",
                    level: "WARNING",
                    priority: "MEDIUM",
                    title: "Cash Drawer Open Too Long",
                    message: `Terminal ${drawer.terminalId} has been open for ${Math.floor((Date.now() - drawer.sessionStart.getTime()) / (60 * 60 * 1000))} hours`,
                    context: {
                        drawerUuid: drawer.uuid,
                        terminalId: drawer.terminalId,
                        sessionStart: drawer.sessionStart,
                    },
                },
            });
        };
  
        console.log(`[CashDrawerReminder] Reminded ${openDrawers.length} stores to close drawers`);
    }
}