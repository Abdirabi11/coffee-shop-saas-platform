import { redis } from "../../lib/redis.ts";
import { getTenantRevenueAnalytics } from "../../services/tenant/tenantAnalytic.service.ts";

export const tenantAnalytics= async (req: { user: any; }, res: { json: (arg0: any) => void; status: (arg0: number) => { (): any; new(): any; json: { (arg0: { message: string; }): void; new(): any; }; }; })=>{
    try {
        const tenantUuid= req.user!.tenantUuid;
        const cacheKey= `tenant:${tenantUuid}:analytics:revenue`;
        
        const cached= await redis.get(cacheKey);
        if (cached) {
            return res.json(JSON.parse(cached));
        };

        const data = await getTenantRevenueAnalytics(tenantUuid);

        await redis.set(cacheKey, JSON.stringify(data), { ex: 300 });
    
        res.json(data);
    } catch (err) {
        console.error("[TENANT_ANALYTICS_FAILED]", err);
        res.status(500).json({ message: "Failed to load analytics" });
    }
};