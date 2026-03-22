import { Request, Response } from "express";
import prisma from "../../config/prisma.ts"

 
export class AuditLogController {
  // GET /api/v1/security/audit?action=&entityType=&actorUuid=&from=&to=
  static async search(req: Request, res: Response) {
    try {
      const tenantUuid = (req as any).user?.tenantUuid;
      if (!tenantUuid) {
        return res.status(400).json({ success: false, error: "TENANT_REQUIRED" });
      }
 
      const {
        action, entityType, actorUuid, category,
        storeUuid, from, to, riskLevel, limit, offset,
      } = req.query;
 
      const where = {
        tenantUuid,
        ...(action && { action: action as string }),
        ...(entityType && { entityType: entityType as string }),
        ...(actorUuid && { actorUuid: actorUuid as string }),
        ...(category && { category: category as string }),
        ...(storeUuid && { storeUuid: storeUuid as string }),
        ...(riskLevel && { riskLevel: riskLevel as string }),
        ...(from && to && {
          createdAt: {
            gte: new Date(from as string),
            lte: new Date(to as string),
          },
        }),
      };
 
      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where: where as any,
          orderBy: { createdAt: "desc" },
          take: parseInt(limit as string) || 50,
          skip: parseInt(offset as string) || 0,
          select: {
            uuid: true,
            action: true,
            entityType: true,
            entityUuid: true,
            category: true,
            performedBy: true,
            targetType: true,
            targetName: true,
            changeSummary: true,
            ipAddress: true,
            riskLevel: true,
            createdAt: true,
          },
        }),
        prisma.auditLog.count({ where: where as any }),
      ]);
 
      return res.status(200).json({
        success: true,
        data: logs,
        pagination: { total, limit: parseInt(limit as string) || 50 },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: "FETCH_FAILED" });
    }
  }
 
  // GET /api/v1/security/audit/:uuid
  static async getDetail(req: Request, res: Response) {
    try {
      const tenantUuid = (req as any).user?.tenantUuid;
      const { uuid } = req.params;
 
      const log = await prisma.auditLog.findFirst({
        where: { uuid, tenantUuid },
      });
 
      if (!log) {
        return res.status(404).json({ success: false, error: "NOT_FOUND" });
      }
 
      return res.status(200).json({ success: true, data: log });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: "FETCH_FAILED" });
    }
  }
 
  // GET /api/v1/security/audit/summary
  static async getSummary(req: Request, res: Response) {
    try {
      const tenantUuid = (req as any).user?.tenantUuid;
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
 
      const [byCategory, byRisk, total] = await Promise.all([
        prisma.auditLog.groupBy({
          by: ["category"],
          where: { tenantUuid, createdAt: { gte: sevenDaysAgo } },
          _count: true,
        }),
        prisma.auditLog.groupBy({
          by: ["riskLevel"],
          where: { tenantUuid, createdAt: { gte: sevenDaysAgo } },
          _count: true,
        }),
        prisma.auditLog.count({
          where: { tenantUuid, createdAt: { gte: sevenDaysAgo } },
        }),
      ]);
 
      return res.status(200).json({
        success: true,
        data: {
          period: "7 days",
          total,
          byCategory: Object.fromEntries(byCategory.map((c) => [c.category, c._count])),
          byRiskLevel: Object.fromEntries(byRisk.map((r) => [r.riskLevel, r._count])),
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: "FETCH_FAILED" });
    }
  }
}