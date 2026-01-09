import { bumpCacheVersion } from "../cache/cacheVersion.js";
import prisma from "../config/prisma.ts"
import { RetentionService } from "../services/retention.service.ts";

export async function runCohortRetention(){
    console.log("runCohortRetention")

    const tenants= await prisma.tenant.findMany({
        select: {uuid: true}
    });

    for (const tenant of tenants) {
        await RetentionService.computeRetentionForTenant(tenant.uuid);
        await bumpCacheVersion(`tenant:${tenant.uuid}:dashboard`);
    };
    console.timeEnd("runCohortRetention");
};