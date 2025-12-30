import {redisClient} from "../lib/redis.ts"


export const invalidateSuperAdminDashboardCache= async ()=>{
    await redisClient.del([
        "sa:dashboard:overview",
        "sa:dashboard:tenants",
        "sa:dashboard:subscriptions",
        "sa:dashboard:tenant-health",
    ]);
};