import type { Request, Response, NextFunction } from "express"
import prisma from "../../config/prisma.ts"
import { redis } from "../../lib/redis.ts";
import { computeSuperAdminKPIs } from "../../services/superAdmin/analytics.service.js";

//Charts, trends, historical data
//Charts only ,Time-series, Heavy queries

export const getAnalyticsKPIs= async (req:Request, res:Response)=>{
    const cacheKey= "sa:analytics:kpis";
    const cached= await redis.get(cacheKey);
    if(cached) return res.json(JSON.parse(cached));

    const result= await computeSuperAdminKPIs()

    await redis.set(cacheKey, JSON.stringify(result), {ex: 300});
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

