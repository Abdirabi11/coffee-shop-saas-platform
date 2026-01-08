import prisma from "../config/prisma.ts"
import { getCache, setCache } from "../cache/cache.js";
import { withCache } from "../utils/cache.ts";
import { buildDateFilter } from "../utils/date.ts";


export class DashboardService {
    static async getAdminOverview(params: {
        from?: string;
        to?: string;
    }) {
        const {from, to}= params;

        const cacheKey = `dashboard:admin:overview:${from ?? "all"}:${to ?? "all"}`;

        return withCache( cacheKey, 120, async ()=> {
            const dateFilter= buildDateFilter(from, to);

            const [
                totalTenants,
                activeTenants,
                revenue,
                invoicesCount,
            ]= await Promise.all([
                prisma.tenant.count(),
                prisma.tenant.count({ where: {status: "ACTIVE"}}),
    
                prisma.invoice.aggregate({
                    _sum: { total: true },
                    where: {
                        status: "PAID",
                        issuedAt: dateFilter
                    },
                }),
    
                prisma.invoice.count({
                    where: {issuedAt: dateFilter}
                }),
            ])
    
            return {
                tenants: {
                    total: totalTenants,
                    active: activeTenants
                },
                billing: {
                    revenue: revenue._sum.total ?? 0,
                    invoices: invoicesCount,
                },
            };
        });  
    }   

    static async getPlatformHealth(){
        return withCache("dashboard:admin:health", 60, async () =>{
            const startOfMonth = new Date(
                new Date().getFullYear(),
                new Date().getMonth(),
                1
            );

            const [
                activeTenants,
                suspendedTenants,
                totalOrders,
            ]= await Promise.all([
                prisma.tenant.count({ where: { status: "ACTIVE" } }),
                prisma.tenant.count({ where: { status: "SUSPENDED" } }),
                prisma.order.count(),
            ]);

            return {
                tenants: {
                    active: activeTenants,
                    suspended: suspendedTenants,
                },
                orders: {
                    total: totalOrders,
                },
            }
        })
      
    }
};

export const getPlatformHealth= async ()=>{
    const startOfMonth= new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
    );

    const [
        totalRevenue,
        monthlyRevenue,
        activeTenants,
        suspendedTenants,
        totalOrders,
    ]= await Promise.all([
        prisma.payment.aggregate({
            where: { status: "SUCCESS" },
            _sum: { amount: true }
        }),
        prisma.payment.aggregate({
            where: {
                status: "ACTIVE",
                createdAt: { gte: startOfMonth }
            },
            _sum: { amount: true }
        }),
        
        prisma.tenant.count({ where: { status: "ACTIVE" } }),
        prisma.tenant.count({ where: { status: "SUSPENDED" } }),
        prisma.order.count(),
    ]);

    return {
        revenue: {
            total: totalRevenue._sum.amount ?? 0,
            thisMonth: monthlyRevenue._sum.amount ?? 0,
        },
        tenants: {
            active: activeTenants,
            suspended: suspendedTenants,
        },
        orders: {
            total: totalOrders,
        },
    }
};

export const getRevenueSnapshot= async ()=>{
    const since= new Date()
    since.setDate(since.getDate() - 30);

    const revenue= await prisma.payment.groupBy({
        by: ["createdAt"],
        where: { 
            status: "SUCCESS",
            createdAt: { gte: since }
        },
        _sum: { amount: true },
        orderBy: { createdAt: "desc" }
    });

    return revenue.map(r => ({
        date: r.createdAt.toISOString().split("T")[0],
        amount: r._sum.amount ?? 0,
    }));
};

export const getTenantDashboard= async ()=>{
    const tenants= await prisma.tenant.findMany({
        include: {
            subscription: {
                select: { status: true, planName: true}
            },
            stores: { select: { uuid: true }},
            users: { select: { uuid: true }}
        },
        orderBy: { createdAt: "desc" }
    });

    return tenants.map(t =>({
        uuid: t.uuid,
        name: t.name,
        status: t.status,
        plan: t.plan,
        subscriptionStatus: t.subscription?.status ?? "NONE",
        storesCount: t.stores.length,
        usersCount: t.users.length,
        createdAt: t.createdAt,
    }));
};

export const getTenantHealth= async ()=>{
    const [
        pastDue,
        trial,
        recentlySuspended,
        tenants,
    ]= await Promise.all([
        prisma.subscription.count({ where: { status: "PAST_DUE"} }),
        prisma.subscription.count({ where: { status: "TRAIL"} }),
        prisma.subscription.count({
            where: {
                status: "SUSPENDED",
                updatedAt: {
                    gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
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

    const PLAN_LIMITS: Record<string, {stores: number, users: number}> ={
        FREE: { stores: 1, users: 3 },
        BASIC: { stores: 2, users: 10 },
        PRO: { stores: 5, users: 30 },
        ENTERPRISE: { stores: 999, users: 999 },
    };

    const nearLimits= tenants.filter(t => {
        const plan= t.subscription?.planName;
        if(!plan || !PLAN_LIMITS[plan]) return false;

        const limits= PLAN_LIMITS[plan];
        return (
            t.stores.length >= limits.stores * 0.8 ||
            t.users.length >= limits.users * 0.8
        );
    }).length;

    return {
        pastDue,
        onTrial: trial,
        recentlySuspended,
        nearLimits,
    };
};

export const getSubscriptionBreakdown= async ()=>{
    const grouped= await prisma.subscription.groupBy({
        by: ["planName"],
        _count: {_all: true}
    });

    const result: Record<string, number>={
        FREE: 0,
        BASIC: 0,
        PRO: 0,
        ENTERPRISE: 0,
    };

    grouped.forEach(g => {
        result[g.planName]= g._count._all
    });
    return result;
};

export const getRiskOverview=async ()=>{
    const since= new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
        blockedTenants,
        recentSignups,
        rateLimitedEvents,
    ]= await Promise.all([
        prisma.tenant.count({ where: { status: "SUSPENDED"} }),
        prisma.tenant.count({ where: { createdAt: { gte: since } }}),
        prisma.rateLimitLog 
          ? prisma.rateLimitLog.count({ where: { createdAt: { gte: since } }})
          : Promise.resolve(0),
    ]);

    return {
        blockedTenants,
        suspiciousActivity: recentSignups,
        rateLimitedEvents,
    };
};