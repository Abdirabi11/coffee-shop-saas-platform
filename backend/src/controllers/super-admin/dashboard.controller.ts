import type { Request, Response } from "express"
import * as DashboardService from "../../services/dashboard.service.ts"
import { AuthRequest } from "../../types/auth.types.ts";


export const getAdminDashboard= async (req:Request, res:Response)=>{
    try {
        const {from, to}= req.query
        
        const data= DashboardService.getAdminOverview({
            from: from as string | undefined,
            to: to as string | undefined,
        });

        return res.json({ success: true, data });
    } catch (err) {
        console.error("Dashboard error:", err);
        return res.status(500).json({ message: "Failed to load dashboard" });
    }
};

export const platformHealth= async (_req: Request, res: Response)=>{
    try {
        const data= await DashboardService.getPlatformHealth();
        res.json({ success: true, data });
    } catch (err) {
        console.error("Dashboard overview error:", err);
        res.status(500).json({ message: "Failed to load dashboard overview" });
    }
};

export const revenueSnapshot= async (req:Request, res:Response)=>{
    try {
        const data= DashboardService.getRevenueSnapshot()
        res.json(data)
    } catch (err) {
        console.error("Revenue analytics error:", err);
        return res.status(500).json({message: "Failed to load revenue snapshot"});
    }
};

export const tenantDashboard= async (req: Request, res: Response)=>{
    try {
        const data = await DashboardService.getTenantDashboard();
        res.json(data);
    } catch (err) {
        console.error("Tenant dashboard error:", err);
        return res.status(500).json({ message: "Failed to load tenants dashboard" });
    }
};

export const tenantHealth= async (req:Request, res:Response)=>{
    try {
        const data = await DashboardService.getTenantHealth();
        res.json(data);
    } catch (err) {
        console.error("Tenant health error:", err);
        return res.status(500).json({ message: "Failed to load tenant health" });
    }
};

export const subscriptionBreakdown= async (req:Request, res:Response)=>{
    try {
        const data = await DashboardService.getSubscriptionBreakdown();
        res.json(data);
    } catch (err) {
        console.error("Subscription breakdown error:", err);
        return res.status(500).json({ message: "Failed to load subscription breakdown" });
    }
};

export const riskOverview= async (req: Request, res: Response)=>{
    try {
        const data = await DashboardService.getRiskOverview();
        res.json(data);
    } catch (err) {
        console.error("Risk dashboard error:", err);
        return res.status(500).json({ message: "Failed to load risk dashboard" });
    }
};

export const fraudOverview= async (req: Request, res: Response)=>{
    const [total, high, medium, low] = await Promise.all([
        prisma.fraudEvent.count(),
        prisma.fraudEvent.count({ where: { severity: "HIGH" } }),
        prisma.fraudEvent.count({ where: { severity: "MEDIUM" } }),
        prisma.fraudEvent.count({ where: { severity: "LOW" } }),
    ]);
    
    res.json({
    totalEvents: total,
    severityBreakdown: { high, medium, low },
    });
};

export const fraudEvents = async (req: AuthRequest, res: Response) => {
    const events = await prisma.fraudEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: { select: { uuid: true, email: true, phoneNumber: true } },
      },
    });
  
    res.json(events);
};

export const highRiskUsers= async (req: AuthRequest, res: Response)=>{
    const events = await prisma.fraudEvent.findMany({
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
    const sessions = await prisma.session.findMany({
      where: {
        revoked: false,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { createdAt: "desc" },
    });
  
    res.json(sessions);
};
