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

    await redisClient.set(cacheKey, result, {ex: 300});
};

export const revenueAnalytics = async (req: Request, res: Response) => {
    const data = await prisma.billingSnapshot.groupBy({
      by: ["month"],
      _sum: { totalAmount: true },
      orderBy: { month: "asc" }
    });
  
    res.json(
      data.map(d => ({
        month: d.month,
        revenue: d._sum.totalAmount
      }))
    );
};

export const revenueAnalytics = async (req: Request, res: Response) => {
    const data = await prisma.$queryRaw<
      { month: Date; revenue: number }[]
    >`
      SELECT month, revenue
      FROM monthly_revenue_mv
      ORDER BY month ASC
    `;
  
    res.json(
      data.map(row => ({
        date: row.month.toISOString().slice(0, 7),
        revenue: Number(row.revenue),
      }))
    );
};

export const revenueAnalytics= async (req:Request, res:Response)=>{
    const {from, to, groupBy= "day"}=req.query as any;

    const invoices= await prisma.invoice.findMany({
        where: {
            status: "PAID",
            paidAt: {
                gte: new Date(),
                lte: new Date(to)
            }
        },
        select: { amount: true, paidAt: true}
    });
    const grouped: Record<string, number>={};

    invoices.forEach((inv)=>{
        const key= dayjs(inv.paidAt).format(
            groupBy === "month"
            ? "YYYY-MM"
            : groupBy === "week"
            ? "YYYY-[W]WW"
            : "YYYY-MM-DD"
        );
        grouped[key]= (grouped[key] || 0) + inv.amount;
    });

    const result= Object.entries(grouped).map(([date, revenue])=>({
        date,
        revenue,
    }));

    res.json(result);
};

export const tenantGrowth= async (req:Request, res:Response)=>{
    const tenants= await prisma.tenant.findMany({
        select: {createdAt: true}
    });

    const grouped: Record<string, number>= {};

    tenants.forEach((t)=>{
        const month= dayjs(t.createdAt).format("MMM")
        grouped[month]= (grouped[month] || 0) + 1;
    });

    res.json(
        Object.entries(grouped).map(([month, newTenants])=> ({
            month,
            newTenants,
        }))
    )
};

export const churnAnalytics= async (req:Request, res:Response)=>{
    const total= await prisma.subscription.count();
    const churned= await prisma.subscription.count({
        where: {status: "CANCELED"}
    });

    const churnRate= total === 0 ? 0 : (churned / total) * 100;

    res.json({
        churnRate: Number(churnRate.toFixed(2)),
        retentionRate: Number((100 - churnRate).toFixed(2))
    })
};

export const churnAnalytics = async (req, res) => {
    const latest = await prisma.analyticsSnapshot.findFirst({
      where: { type: "CHURN" },
      orderBy: { createdAt: "desc" },
    });
  
    if (!latest) {
      return res.json({
        churnRate: 0,
        retentionRate: 100,
      });
    }
  
    res.json(latest.data);
  };

export const usageAnalytics= async (req:Request, res:Response)=>{
    const [orders, stores]= await Promise.all([
        prisma.store.findMany({ select: {createdAt: true}}),
        prisma.order.findMany({ select: {createdAt: true}})
    ]);

    const group= (items: {createdAt: Date}[])=>{
        const result: Record<string, number>= {};
        items.forEach((i)=>{
            const date= dayjs.(i.createdAt).format("YYYY-MM-DD")
        });

        return Object.entries(result).map(([date, count]) => ({
            date,
            count,
        }));
    };
    res.json({
        storesCreated: group(stores),
        ordersPlaced: group(orders),
    });
};

export const cohorts= async (req:Request, res:Response)=>{
    const tenants= await prisma.tenant.findMany({
        select: {
            createdAt: true,
            subscription: {
                select: {
                    startedAt: true,
                    endedAt: true,
                    status: true
                }
            }
        }
    });

    const cohorts: Record<string, any[]>= {};

    tenants.forEach((tenant) => {
        const cohortKey = dayjs(tenant.createdAt).format("YYYY-MM");
        cohorts[cohortKey] ||= [];
        cohorts[cohortKey].push(tenant);
    });

    const result= Object.entries(cohorts).map(([cohort, tenants])=>{
        const total= tenants.length;

        const retainedAfter= (months: number)=>{
            const date= dayjs(cohort).add(months, "month");
            const retained= tenants.filter((t)=>{
                const sub= t.subscription
                if(!sub) return false;
                if(sub.status === "ACTIVE") return true;
                if(sub.endedAt && dayjs(sub.endedAt).isAfter(date)) return true;
                return false;
            }).length;

            return total === 0 ? 0 : Math.round((retained / total) * 100);
        }
        return {
            cohort,
            month0: 100,
            month1: retainedAfter(1),
            month3: retainedAfter(3),
        };
    });
    res.json(result);
};

export const cohortRetentionAnalytics = async (req:Request, res:Response) => {
    const data = await prisma.analyticsSnapshot.findMany({
      where: { type: "COHORT_RETENTION" },
      orderBy: { period: "asc" },
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

