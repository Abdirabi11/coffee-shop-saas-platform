import type { Request, Response, NextFunction } from "express"
import prisma from "../../config/prisma.ts"
import { redisClient } from "../../lib/redis.ts";

//Charts, trends, historical data
//Charts only ,Time-series, Heavy queries

export const getAnalyticsKPIs= async (req:Request, res:Response)=>{
    const cacheKey= "sa:analytics:kpis";
    const cached= await redisClient.get(cacheKey);
    if(cached) return res.json(cached);

    const [revenue, activeTenants, churned, trials, converted]=
        await Promise.all([
            prisma.invoice.aggregate({
                _sum: { amount: true},
                where: { status: "PAID"}
            }),
            prisma.subscription.count({ where: {status: "ACTIVE"}}),
            prisma.subscription.count({ where: {status: "CANCELED"}}),
            prisma.subscription.count({ where: {status: "TRAIL"}}),
            prisma.subscription.count({
                where: { status: "ACTIVE", startedAt: { not: null } },
            }),
        ]);

    const churnRate= activeTenants === 0 ? 0 : (churned / activeTenants) * 100;
    const trailConversationRate= trials === 0 ? 0 : (converted / trials) * 100;

    const result= {
        totalRevenue: revenue._sum.amount || 0,
        activeTenants,
        churnRate: Number(churnRate.toFixed(2)),
        trailConversationRate: Number(trailConversationRate.toFixed(2))
    };

    await redisClient.set(cacheKey, JSON.stringify(result), {ex: 300});
    res.json(result);
};

export const revenueAnalytics = async (req: Request, res: Response) => {
    const data = await prisma.analyticsSnapshot.findMany({
      where: { type: "MONTHLY_REVENUE"},
      orderBy: {period: "asc"}
    });
  
    res.json(
      data.map(d => ({
        month: d.period,
        revenue: d.data.revenue
      }))
    );
};

export const churnAnalytics = async (req:Request, res:Response) => {
    const latest = await prisma.analyticsSnapshot.findFirst({
      where: { type: "CHURN" },
      orderBy: { createdAt: "desc" },
    });
  
    res.json(
        latest?.data ?? { churnRate: 0, retentionRate: 100 }
    );
};

export const cohortRetentionAnalytics= async (req:Request, res:Response)=>{
    const data= await prisma.analyticsSnapshot.findMany({
        where: {type: "COHORT_RETENTION"},
        orderBy: {period: "asc"}
    });
    res.json(data.map(d => d.data));
};

export const arpuLtvAnalytics = async (req: Request, res:Response) => {
    const latest = await prisma.analyticsSnapshot.findFirst({
        where: { type: "ARPU_LTV" },
        orderBy: { createdAt: "desc" },
    });
    
    res.json(latest?.data ?? { arpu: 0, ltv: 0 });
};

export const tenantAnalytics= async (req:Request, res:Response)=>{
    try {
        const last12Month= new Date();
        last12Month.setDate(last12Month.getDate() -360);

        const revenue= await prisma.payment.groupBy({
            by: ["createdAt"],
            where:{
                status: "SUCCESS",
                created: {gte: last12Month}
            }
        })
    } catch (err) {
        
    }
};

