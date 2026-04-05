import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

export class SnapshotCleanupJob {
  
    //Delete old snapshots (keep last 30 days)
    static async run() {
        logWithContext("info", "[SnapshotCleanup] Starting cleanup");

        try {
            const thirtyDaysAgo = dayjs().subtract(30, "day").toDate();

            // Keep at least one snapshot per store
            const stores = await prisma.store.findMany({
                where: { active: true },
                select: { uuid: true },
            });

            let deleted = 0;

            for (const store of stores) {
                // Get oldest snapshots (keep latest 30)
                const oldSnapshots = await prisma.menuSnapshot.findMany({
                    where: {
                        storeUuid: store.uuid,
                        createdAt: { lt: thirtyDaysAgo },
                    },
                    orderBy: { version: "asc" },
                    skip: 1, // Keep at least 1 old snapshot
                });

                if (oldSnapshots.length > 0) {
                    const uuids = oldSnapshots.map((s) => s.uuid);

                    await prisma.menuSnapshot.deleteMany({
                        where: { uuid: { in: uuids } },
                    });

                    deleted += uuids.length;
                }
            }

            logWithContext("info", "[SnapshotCleanup] Completed", {
                deleted,
            });

            return { deleted };

        } catch (error: any) {
            logWithContext("error", "[SnapshotCleanup] Failed", {
                error: error.message,
            });

            throw error;
        }
    }
}