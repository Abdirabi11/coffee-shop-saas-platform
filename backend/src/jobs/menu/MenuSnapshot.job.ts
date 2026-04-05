import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MenuSnapshotService } from "../../services/menu/menuSnapshot.service.ts";


export class MenuSnapshotJob {
  
    //Create daily snapshots for all stores
    static async run() {
        logWithContext("info", "[MenuSnapshot] Starting daily snapshots");

        try {
            const stores = await prisma.store.findMany({
                where: { active: true },
                select: {
                uuid: true,
                tenantUuid: true,
                name: true,
                },
            });

            let created = 0;
            let skipped = 0;
            let errors = 0;

            for (const store of stores) {
                try {
                    const snapshot = await MenuSnapshotService.createSnapshot({
                        tenantUuid: store.tenantUuid,
                        storeUuid: store.uuid,
                        reason: "SCHEDULED_BACKUP",
                        triggeredBy: "SYSTEM",
                    });

                    if (snapshot) {
                        created++;
                    } else {
                        skipped++;
                    }

                } catch (error: any) {
                    errors++;
                    logWithContext("error", "[MenuSnapshot] Failed to create", {
                        storeUuid: store.uuid,
                        storeName: store.name,
                        error: error.message,
                    });
                }
            }

            logWithContext("info", "[MenuSnapshot] Completed", {
                total: stores.length,
                created,
                skipped,
                errors,
            });

            return { created, skipped, errors };

        } catch (error: any) {
            logWithContext("error", "[MenuSnapshot] Job failed", {
                error: error.message,
            });

            throw error;
        }
    }
}