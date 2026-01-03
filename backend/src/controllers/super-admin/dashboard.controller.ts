import type { Request, Response } from "express"
import prisma from "../../config/prisma.ts"
import { AuthRequest } from "../../types/auth.types.ts";

//UI-ready KPIs & cards
export const dashboardOverview= async (req:Request, res:Response)=>{
    try {
        const [
            totalRevenue,
            monthlyRevenue,
            activeTenants,
            suspendedTenants,
            totalOrders,
        ]= await Promise.all([
            prisma.payment.aggregate({
                where: {status: "SUCCESS"},
                _sum:  { amount: true}
            }),

            prisma.payment.aggregate({
                where: {
                    status: "SUCCESS",
                    createdAt: {
                        gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                    }
                },
                _sum: {amount: true}
            }),

            prisma.tenant.count({
                where: { status: "ACTIVE" },
            }),
    
            prisma.tenant.count({
                where: {status: "SUSPENDED"}
            }),
    
            prisma.order.count()
        ]);

        return res.json({
            revenue: {
                total: totalRevenue._sum.amount ?? 0,
                thisMonth: monthlyRevenue._sum.amount ?? 0,
            },
            tenants: {
                active: activeTenants,
                suspended: suspendedTenants,
            },
            orders: {
                total: totalOrders
            },
        });
    } catch (err) {
        console.error("Dashboard overview error:", err);
        return res.status(500).json({ message: "Failed to load dashboard overview" });
    } 
};

export const revenueSnap= async (req:Request, res:Response)=>{
    try {
        const last30Days= new Date()
        last30Days.setDate(last30Days.getDate() -30);

        const revenue= await prisma.payment.groupBy({
            by: ["createdAt"],
            where: {
                status: "SUCCESS",
                createdAt: {gte: last30Days}
            },
            _sum: {
                amount: true
            },
            orderBy: {
                createdAt: "asc"
            }
        });

        return res.json(
            revenue.map((r: any) => ({
              date: r.createdAt.toISOString().split("T")[0],
              amount: r._sum.amount ?? 0,
            }))
        );
    } catch (err) {
        console.error("Revenue analytics error:", err);
        return res.status(500).json({ message: "Failed to load revenue analytics" });
    }
};

export const tenantDashboard= async (req: Request, res: Response)=>{
    try {
        const tenants= await prisma.tenant.findMany({
            include: {
                subscription: {
                    select: {
                        status: true,
                        planName: true
                    }
                },
                stores: {
                    select: {uuid: true}
                },
                users: {
                    select: {uuid: true}
                }
            },
            orderBy: {
                createdAt: "desc"
            }
        });

        const formatted= tenants.map((tenant: any)=>({
            uuid: tenant.uuid,
            name: tenant.name,
            status: tenant.status,
            plan: tenant.subscription?.planName ?? "NONE",
            subscriptionStatus: tenant.subscription?.status ?? "NONE",
            storesCount: tenant.stores.length,
            usersCount: tenant.users.length,
            createdAt: tenant.createdAt,
        }));

        res.json(formatted);
    } catch (err) {
        console.error("Tenant dashboard error:", err);
        return res.status(500).json({ message: "Failed to load tenants dashboard" });
    }
};

export const TenantHealth= async (req:Request, res:Response)=>{
    try {
        const [
            pastDue,
            trailTenants,
            recentlySuspended,
            tenantsWithUsage
        ]= await Promise.all([
            prisma.subscription.count({
                where: {status: "PAST_DUE"}
            }),

            prisma.subscription.count({
                where: {status: "TRIAL"}
            }),

            prisma.subscription.count({
                where: {
                    status: "SUSPENDED",
                    updatedAt: {
                        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                    }
                }
            }),

            prisma.tenant.findMany({
                include: {
                    stores: true,
                    users: true,
                    subscription: true
                }
            })
        ]);

        const PLAN_LIMITS: Record<string, {stores: number, users: number}> = {
            FREE: { stores: 1, users: 3 },
            BASIC: { stores: 2, users: 10 },
            PRO: { stores: 5, users: 30 },
            ENTERPRISE: { stores: 999, users: 999 }
        };

        const nearLimits= tenantsWithUsage.filter(t =>{
            const plan= t.subscription?.planName;
            if(!plan || !PLAN_LIMITS[plan]) return false;

            const limits= PLAN_LIMITS[plan];
            return (
                t.stores.length >= limits.stores * 0.8 ||
                t.users.length >= limits.users * 0.8
            )
        }).length;

        return res.json({
            pastDue,
            onTrail: trailTenants,
            nearLimits,
            recentlySuspended
        });
    } catch (err) {
        console.error("Tenant health error:", err);
        return res.status(500).json({ message: "Failed to load tenant health" });
    }
};

export const tenantHealth = async (req: Request, res: Response) => {
    const tenants = await prisma.tenant.findMany({
      include: {
        users: true,
        stores: true,
        subscription: {
          include: { plan: true },
        },
      },
    });
  
    const nearLimits = tenants.filter(t => {
      const plan = t.subscription?.plan;
      if (!plan) return false;
  
      return (
        t.users.length >= plan.maxUsers * 0.8 ||
        t.stores.length >= plan.maxStores * 0.8
      );
    }).length;
  
    const pastDue = await prisma.subscription.count({
      where: { status: "PAST_DUE" },
    });
  
    const trial = await prisma.subscription.count({
      where: { status: "TRIAL" },
    });
  
    return res.json({
      nearLimits,
      pastDue,
      onTrial: trial,
    });
};

export const subscriptionBreakdown= async (req:Request, res:Response)=>{
    try {
        const grouped= await prisma.subscription.groupBy({
            by: ["planName"],
            _count: { _all: true}
        });

        const result: Record<string, number> ={
            FREE: 0,
            BASIC: 0,
            PRO: 0,
            ENTERPRISE: 0
        };

        grouped.forEach(g =>{
            result[g.planName]= g._count._all
        });
        res.json(result)
    } catch (err) {
        console.error("Subscription breakdown error:", err);
        return res.status(500).json({ message: "Failed to load subscription breakdown" });
    }
};

export const risk= async (req: Request, res: Response)=>{
    try {
        const [
            blockedTenants,
            recentSignups,
            rateLimitedTenants
        ]= await Promise.all([

            prisma.tenant.count({
                where: {status: "SUSPENDED"}
            }),

            prisma.user.count({
                where: {
                    createdAt: {
                        gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
                    }
                }
            }),

            prisma.rateLimitLog?.count({
                createdAt: {
                    gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
                }
            }) ?? 0
        ]);

        return res.json({
            rateLimitedTenants,
            blockedTenants,
            suspiciousActivity: recentSignups
        });
    } catch (err) {
        console.error("Risk dashboard error:", err);
        return res.status(500).json({ message: "Failed to load risk dashboard" });
    }
};

export const fraudOverview= async (req: Request, res: Response)=>{
    const storeUuid= req.user!.storeUuid;

    const [total, high, medium, low] = await Promise.all([
        prisma.fraudEvent.count({ where: { storeUuid } }),
        prisma.fraudEvent.count({ where: { storeUuid, severity: "HIGH" } }),
        prisma.fraudEvent.count({ where: { storeUuid, severity: "MEDIUM" } }),
        prisma.fraudEvent.count({ where: { storeUuid, severity: "LOW" } }),
    ]);
    
    res.json({
    totalEvents: total,
    severityBreakdown: { high, medium, low },
    });
};

export const fraudEvents = async (req: AuthRequest, res: Response) => {
    const storeUuid = req.user!.storeUuid;
  
    const events = await prisma.fraudEvent.findMany({
      where: { storeUuid },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: { select: { uuid: true, email: true, phoneNumber: true } },
      },
    });
  
    res.json(events);
};

export const highRiskUsers= async (req: AuthRequest, res: Response)=>{
    const storeUuid = req.user!.storeUuid;

    const events = await prisma.fraudEvent.findMany({
      where: { storeUuid },
      select: { userUuid: true, severity: true },
    });

    const scoreMap = new Map<string, number>();

    for (const e of events) {
      const score =
        e.severity === "LOW" ? 1 :
        e.severity === "MEDIUM" ? 3 :
        e.severity === "HIGH" ? 6 : 10;
  
      scoreMap.set(e.userUuid, (scoreMap.get(e.userUuid) || 0) + score);
    }
  
    const riskyUsers = [...scoreMap.entries()]
      .filter(([_, score]) => score >= 10)
      .map(([userUuid, score]) => ({ userUuid, score }));
  
    res.json(riskyUsers);
};

export const suspiciousSessions = async (req: AuthRequest, res: Response) => {
    const storeUuid = req.user!.storeUuid;
  
    const sessions = await prisma.session.findMany({
      where: {
        storeUuid,
        revoked: false,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { createdAt: "desc" },
    });
  
    res.json(sessions);
};
