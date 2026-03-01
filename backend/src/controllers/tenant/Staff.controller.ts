import { Request, Response } from "express";
import prisma from "../../config/prisma.ts"
import { TenantInvitationService } from "../../services/tenant/TenantInvitation.service.ts";

export class StaffController {

    //GET /api/staff
    //List all staff members in tenant
    static async listStaff(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;

            const staff = await prisma.tenantUser.findMany({
                where: {
                    tenantUuid,
                    isActive: true,
                },
                include: {
                    user: {
                        select: {
                        uuid: true,
                        name: true,
                        email: true,
                        phoneNumber: true,
                        },
                    },
                    stores: {
                        include: {
                        store: {
                            select: {
                            uuid: true,
                            name: true,
                            },
                        },
                        },
                    },
                },
                orderBy: { joinedAt: "desc" },
            });

            return res.status(200).json({
                success: true,
                staff,
            });
        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to list staff",
            });
        }
    }

    //POST /api/staff/invite
    //Invite new staff member
    static async inviteStaff(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const userUuid = req.user!.uuid;
            const { email, role, storeUuids } = req.body;

            // Validate input
            if (!email || !role) {
                return res.status(400).json({
                error: "VALIDATION_ERROR",
                message: "Email and role are required",
                });
            }

            const invitation = await TenantInvitationService.inviteUser({
                tenantUuid,
                email,
                role,
                storeUuids: storeUuids || [],
                invitedBy: userUuid,
            });

            return res.status(201).json({
                success: true,
                invitation,
            });
        } catch (error: any) {
            if (error.message === "USER_ALREADY_MEMBER") {
                return res.status(409).json({
                    error: "USER_ALREADY_MEMBER",
                    message: "User is already a member of this organization",
                });
            }
        
              return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to invite staff",
            });
        }
    }

    //PATCH /api/staff/:staffUuid
    //Update staff member
    static async updateStaff(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { staffUuid } = req.params;
            const { role, storeUuids, isActive } = req.body;

            // Update tenant user
            const updated = await prisma.tenantUser.update({
                where: {
                    uuid: staffUuid,
                    tenantUuid,
                },
                data: {
                    role,
                    isActive,
                },
            });

            // Update store access if provided
            if (storeUuids) {
                // Remove old access
                await prisma.userStore.deleteMany({
                    where: {
                        tenantUserUuid: staffUuid,
                    },
                });

                // Add new access
                await prisma.userStore.createMany({
                    data: storeUuids.map((storeUuid: string) => ({
                        userUuid: updated.userUuid,
                        storeUuid,
                        tenantUserUuid: staffUuid,
                        role: updated.role,
                    })),
                });
            };

            return res.status(200).json({
                success: true,
                staff: updated,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to update staff",
            });
        }
    }

    //DELETE /api/staff/:staffUuid
    //Remove staff member
    static async removeStaff(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { staffUuid } = req.params;

            // Soft delete
            await prisma.tenantUser.update({
                where: {
                    uuid: staffUuid,
                    tenantUuid,
                },
                data: {
                    isActive: false,
                    leftAt: new Date(),
                },
            });

            // Revoke all sessions
            const staff = await prisma.tenantUser.findUnique({
                where: { uuid: staffUuid },
                select: { userUuid: true },
            });

            if (staff) {
                await prisma.session.updateMany({
                    where: {
                        userUuid: staff.userUuid,
                        tenantUuid,
                    },
                    data: {
                        status: "REVOKED",
                        revoked: true,
                        revokedBy: req.user!.uuid,
                        revokedReason: "Staff removed from organization",
                    },
                });
            };

            return res.status(200).json({
                success: true,
                message: "Staff member removed",
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to remove staff",
            });
        }
    }
   
    //GET /api/staff/invitations
    //List pending invitations
    static async listInvitations(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;

            const invitations = await TenantInvitationService.listInvitations(tenantUuid);

            return res.status(200).json({
                success: true,
                invitations,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to list invitations",
            });
        }
    }

    //DELETE /api/staff/invitations/:invitationUuid
    //Revoke invitation
    static async revokeInvitation(req: Request, res: Response) {
        try {
            const { invitationUuid } = req.params;
            const userUuid = req.user!.uuid;

            await TenantInvitationService.revokeInvitation({
                invitationUuid,
                revokedBy: userUuid,
            });

            return res.status(200).json({
                success: true,
                message: "Invitation revoked",
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to revoke invitation",
            });
        }
    }
}