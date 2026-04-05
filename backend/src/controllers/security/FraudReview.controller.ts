import { Request, Response } from "express";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
 
export class FraudReviewController {
    // GET /api/v1/security/fraud?status=PENDING&severity=HIGH&limit=50
    static async listEvents(req: Request, res: Response) {
        try {
            const tenantUuid = (req as any).user?.tenantUuid;
            if (!tenantUuid) {
                return res.status(400).json({ success: false, error: "TENANT_REQUIRED" });
            }
        
            const { status, severity, category, storeUuid, limit, offset } = req.query;
        
            const where = {
                tenantUuid,
                ...(status && { status: status as string }),
                ...(severity && { severity: severity as string }),
                ...(category && { category: category as string }),
                ...(storeUuid && { storeUuid: storeUuid as string }),
            };
        
            const [events, total] = await Promise.all([
                prisma.fraudEvent.findMany({
                    where: where as any,
                    orderBy: { createdAt: "desc" },
                    take: parseInt(limit as string) || 50,
                    skip: parseInt(offset as string) || 0,
                    select: {
                        uuid: true,
                        type: true,
                        category: true,
                        severity: true,
                        status: true,
                        reason: true,
                        ipAddress: true,
                        userUuid: true,
                        storeUuid: true,
                        orderUuid: true,
                        paymentUuid: true,
                        createdAt: true,
                        reviewedBy: true,
                        reviewedAt: true,
                    },
                }),
                prisma.fraudEvent.count({ where: where as any }),
            ]);
        
            return res.status(200).json({
                success: true,
                data: events,
                pagination: {
                    t: parseInt(offset as string) || 0,
                },
            });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
    
    // GET /api/v1/security/fraud/:uuid
    static async getEvent(req: Request, res: Response) {
        try {
            const { uuid } = req.params;
            const tenantUuid = (req as any).user?.tenantUuid;
        
            const event = await prisma.fraudEvent.findFirst({
                where: { uuid, tenantUuid },
            });
        
            if (!event) {
                return res.status(404).json({ success: false, error: "NOT_FOUND" });
            }
        
            return res.status(200).json({ success: true, data: event });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
    
    // POST /api/v1/security/fraud/:uuid/review
    static async reviewEvent(req: Request, res: Response) {
        try {
            const staff = (req as any).user;
            const { uuid } = req.params;
            const { status, resolution, actionTaken } = req.body;
        
            if (!status || !["CONFIRMED", "FALSE_POSITIVE", "RESOLVED"].includes(status)) {
                return res.status(400).json({
                    success: false,
                    error: "status must be CONFIRMED, FALSE_POSITIVE, or RESOLVED",
                });
            }
    
            const event = await prisma.fraudEvent.update({
                where: { uuid },
                data: {
                    status,
                    resolution,
                    actionTaken,
                    reviewedBy: staff.uuid,
                    reviewedAt: new Date(),
                },
            });
        
            logWithContext("info", "[Security] Fraud event reviewed", {
                fraudUuid: uuid,
                status,
                reviewedBy: staff.uuid,
            });
        
            return res.status(200).json({ success: true, data: event });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "REVIEW_FAILED" });
        }
    }
    
    // GET /api/v1/security/fraud/stats
    static async getStats(req: Request, res: Response) {
        try {
            const tenantUuid = (req as any).user?.tenantUuid;
            if (!tenantUuid) {
                return res.status(400).json({ success: false, error: "TENANT_REQUIRED" });
            }
        
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
            const [bySeverity, byStatus, byType, total] = await Promise.all([
                prisma.fraudEvent.groupBy({
                    by: ["severity"],
                    where: { tenantUuid, createdAt: { gte: thirtyDaysAgo } },
                    _count: true,
                }),
                prisma.fraudEvent.groupBy({
                    by: ["status"],
                    where: { tenantUuid, createdAt: { gte: thirtyDaysAgo } },
                    _count: true,
                }),
                prisma.fraudEvent.groupBy({
                    by: ["type"],
                    where: { tenantUuid, createdAt: { gte: thirtyDaysAgo } },
                    _count: true,
                    orderBy: { _count: { type: "desc" } },
                }),
                prisma.fraudEvent.count({
                    where: { tenantUuid, createdAt: { gte: thirtyDaysAgo } },
                }),
            ]);
        
            const pending = byStatus.find((s) => s.status === "PENDING")?._count ?? 0;
        
            return res.status(200).json({
                success: true,
                data: {
                    period: "30 days",
                    total,
                    pendingReview: pending,
                    bySeverity: Object.fromEntries(bySeverity.map((s) => [s.severity, s._count])),
                    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
                    byType: byType.map((t) => ({ type: t.type, count: t._count })),
                },
            });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
}