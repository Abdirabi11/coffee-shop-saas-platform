import type { Request, Response } from "express";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";


export class TenantSecurityController {
 
    // GET /tenant/security/overview
    static async getOverview(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
 
            const [
                activeSessions,
                highRiskSessions,
                recentFraudEvents,
                bannedUsers,
            ] = await Promise.all([
                prisma.session.count({
                    where: { tenantUuid, status: "ACTIVE" },
                }),
                prisma.session.count({
                    where: {
                        tenantUuid,
                        riskLevel: { in: ["HIGH", "CRITICAL"] },
                        status: "ACTIVE",
                    },
                }),
                prisma.fraudEvent.count({
                    where: { tenantUuid, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
                }),
                prisma.tenantUser.count({
                    where: { tenantUuid, isBanned: true },
                }),
            ]);
 
            return res.status(200).json({
                success: true,
                data: { activeSessions, highRiskSessions, recentFraudEvents, bannedUsers },
            });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "SECURITY_OVERVIEW_FAILED" });
        }
    }
 
    // GET /tenant/security/sessions?status=ACTIVE
    static async getSessions(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const status = req.query.status as string || "ACTIVE";
 
            const sessions = await prisma.session.findMany({
                where: { tenantUuid, status: status as any },
                select: {
                    uuid: true,
                    userUuid: true,
                    deviceType: true,
                    deviceOS: true,
                    deviceBrowser: true,
                    ipAddress: true,
                    riskLevel: true,
                    riskScore: true,
                    lastActivityAt: true,
                    createdAt: true,
                },
                orderBy: { lastActivityAt: "desc" },
                take: 100,
            });
 
            return res.status(200).json({ success: true, data: sessions });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
 
    // GET /tenant/security/fraud-events
    static async getFraudEvents(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
 
            const events = await prisma.fraudEvent.findMany({
                where: { tenantUuid },
                orderBy: { createdAt: "desc" },
                take: 50,
            });
 
            return res.status(200).json({ success: true, data: events });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
 
    // GET /tenant/security/audit-logs?limit=50
    static async getAuditLogs(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const limit = parseInt(req.query.limit as string) || 50;
 
            const logs = await prisma.auditLog.findMany({
                where: { tenantUuid },
                orderBy: { createdAt: "desc" },
                take: limit,
            });
 
            return res.status(200).json({ success: true, data: logs });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
 
    // POST /tenant/security/sessions/:sessionUuid/revoke
    static async revokeSession(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { sessionUuid } = req.params;
            const user = (req as any).user;
 
            const session = await prisma.session.findFirst({
                where: { uuid: sessionUuid, tenantUuid },
            });
 
            if (!session) {
                return res.status(404).json({ success: false, error: "SESSION_NOT_FOUND" });
            }
 
            await prisma.session.update({
                where: { uuid: sessionUuid },
                data: {
                    status: "REVOKED",
                    revoked: true,
                    revokedAt: new Date(),
                    revokedBy: user.userUuid,
                    revokedReason: "Admin revoked",
                },
            });
 
            logWithContext("info", "[TenantSecurity] Session revoked", { sessionUuid, by: user.userUuid });
            return res.status(200).json({ success: true, message: "Session revoked" });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "REVOKE_FAILED" });
        }
    }
 
    // POST /tenant/security/users/:userUuid/force-logout
    static async forceLogoutUser(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { userUuid } = req.params;
            const actor = (req as any).user;
 
            await prisma.session.updateMany({
                where: { userUuid, tenantUuid, status: "ACTIVE" },
                data: {
                    status: "REVOKED",
                    revoked: true,
                    revokedAt: new Date(),
                    revokedBy: actor.userUuid,
                    revokedReason: "Admin force logout",
                },
            });
 
            logWithContext("info", "[TenantSecurity] User force logged out", { userUuid, by: actor.userUuid });
            return res.status(200).json({ success: true, message: "User logged out from all sessions" });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "FORCE_LOGOUT_FAILED" });
        }
    }
}
 