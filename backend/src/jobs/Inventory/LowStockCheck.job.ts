import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { InventoryAlertService } from "../../services/inventory/InventoryAlert.service.ts";


export class LowStockCheckJob {
    static cronSchedule = "*/30 * * * *";
 
    static async run() {
        logWithContext("info", "[LowStockCheck] Starting");
    
        try {
            const stores = await prisma.store.findMany({
                where: { active: true, status: "ACTIVE" },
                select: { uuid: true, tenantUuid: true },
            });
 
            let totalAlerts = 0;
 
            for (const store of stores) {
                try {
                    const alerts = await InventoryAlertService.checkStoreLevels(
                        store.tenantUuid,
                        store.uuid
                    );
                    totalAlerts += alerts.length;
                } catch (error: any) {
                    logWithContext("error", "[LowStockCheck] Store failed", {
                        storeUuid: store.uuid,
                        error: error.message,
                    });
                }
            }
 
            logWithContext("info", "[LowStockCheck] Completed", {
                storesChecked: stores.length,
                totalAlerts,
            });
        
            return { storesChecked: stores.length, totalAlerts };
        } catch (error: any) {
            logWithContext("error", "[LowStockCheck] Fatal error", {
                error: error.message,
            });
            throw error;
        }
    }
}