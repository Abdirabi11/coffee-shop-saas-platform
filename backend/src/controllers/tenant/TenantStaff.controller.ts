import type { Request, Response } from "express";
import prisma from "../../config/prisma.ts"
import { TenantInvitationService } from "../../services/tenant/TenantInvitation.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

export class TenantStaffController {
 
    // GET /tenant/staff
    static async listStaff(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
 
            const staff = await prisma.tenantUser.findMany({
                where: { tenantUuid, isActive: true },
                include: {
                    user: {
                        select: {
                            uuid: true,
                            name: true,
                            email: true,
                            phoneNumber: true,
                            profilePhoto: true,
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
            });
 
            return res.status(200).json({ success: true, data: staff });
        } catch (error: any) {
            logWithContext("error", "[TenantStaff] List failed", { error: error.message });
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
 
    // POST /tenant/staff/invite
    static async inviteStaff(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const user = (req as any).user;
            const { email, role, storeUuids } = req.body;
 
            if (!email || !role) {
                return res.status(400).json({ success: false, error: "EMAIL_AND_ROLE_REQUIRED" });
            }
 
            const invitation = await TenantInvitationService.inviteUser({
                tenantUuid,
                email,
                role,
                storeUuids: storeUuids || [],
                invitedBy: user.userUuid,
            });
 
            return res.status(201).json({ success: true, data: invitation });
        } catch (error: any) {
            if (error.message === "USER_ALREADY_MEMBER") {
                return res.status(409).json({ success: false, error: "USER_ALREADY_MEMBER" });
            }
            logWithContext("error", "[TenantStaff] Invite failed", { error: error.message });
            return res.status(500).json({ success: false, error: "INVITE_FAILED" });
        }
    }
 
    // PATCH /tenant/staff/:staffUuid
    static async updateStaff(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { staffUuid } = req.params;
            const { role, isActive } = req.body;
 
            const updated = await prisma.tenantUser.update({
                where: { uuid: staffUuid, tenantUuid },
                data: { ...(role && { role }), ...(isActive !== undefined && { isActive }) },
            });
 
            logWithContext("info", "[TenantStaff] Updated", { staffUuid, role, isActive });
            return res.status(200).json({ success: true, data: updated });
        } catch (error: any) {
            logWithContext("error", "[TenantStaff] Update failed", { error: error.message });
            return res.status(500).json({ success: false, error: "UPDATE_FAILED" });
        }
    }
 
    // DELETE /tenant/staff/:staffUuid
    static async removeStaff(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { staffUuid } = req.params;
            const actor = (req as any).user;
 
            // Soft delete
            const staff = await prisma.tenantUser.update({
                where: { uuid: staffUuid, tenantUuid },
                data: { isActive: false },
                select: { userUuid: true },
            });
 
            // Revoke all their sessions
            await prisma.session.updateMany({
                where: { userUuid: staff.userUuid, tenantUuid, status: "ACTIVE" },
                data: {
                    status: "REVOKED",
                    revoked: true,
                    revokedAt: new Date(),
                    revokedBy: actor.userUuid,
                    revokedReason: "Staff removed",
                },
            });
 
            logWithContext("info", "[TenantStaff] Removed", { staffUuid, by: actor.userUuid });
            return res.status(200).json({ success: true, message: "Staff member removed" });
        } catch (error: any) {
            logWithContext("error", "[TenantStaff] Remove failed", { error: error.message });
            return res.status(500).json({ success: false, error: "REMOVE_FAILED" });
        }
    }
 
    // GET /tenant/staff/invitations
    static async listInvitations(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const invitations = await TenantInvitationService.listInvitations(tenantUuid);
            return res.status(200).json({ success: true, data: invitations });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
 
    // DELETE /tenant/staff/invitations/:invitationUuid
    static async revokeInvitation(req: Request, res: Response) {
        try {
            const { invitationUuid } = req.params;
            const user = (req as any).user;
 
            await TenantInvitationService.revokeInvitation({
                invitationUuid,
                revokedBy: user.userUuid,
            });
 
            return res.status(200).json({ success: true, message: "Invitation revoked" });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "REVOKE_FAILED" });
        }
    }
}