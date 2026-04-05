import crypto from "crypto";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { EmailService } from "../notification/Email.service.ts";


export class TenantInvitationService{
    //Invite user to tenant
    static async inviteUser(input: {
        tenantUuid: string;
        email: string;
        role: "TENANT_ADMIN" | "MANAGER" | "CASHIER";
        storeUuids: string[]; // Which stores they can access
        invitedBy: string;
    }) {
        try {
            // Check if user already exists
            let user = await prisma.user.findUnique({
                where: { email: input.email },
            });

            // Check if already a member
            if (user) {
                const existing = await prisma.tenantUser.findFirst({
                    where: {
                        tenantUuid: input.tenantUuid,
                        userUuid: user.uuid,
                        isActive: true,
                    },
                });

                if (existing) {
                    throw new Error("USER_ALREADY_MEMBER");
                }
            };

            // Generate invitation token
            const invitationToken = crypto.randomBytes(32).toString("hex");
            const hashedToken = crypto
                .createHash("sha256")
                .update(invitationToken)
                .digest("hex");

            // Create invitation
            const invitation = await prisma.tenantInvitation.create({
                data: {
                    tenantUuid: input.tenantUuid,
                    email: input.email,
                    role: input.role,
                    token: hashedToken,
                    invitedBy: input.invitedBy,
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
                    storeAccess: input.storeUuids,
                },
            });

            // Get tenant info
            const tenant = await prisma.tenant.findUnique({
                where: { uuid: input.tenantUuid },
                select: { name: true },
            });

            // Send invitation email
            const inviteLink = `${process.env.APP_URL}/accept-invite?token=${invitationToken}`;

            await EmailService.send({
                to: input.email,
                subject: `You're invited to join ${tenant?.name}`,
                template: "tenant-invitation",
                data: {
                    tenantName: tenant?.name,
                    role: input.role,
                    inviteLink,
                    expiresIn: "7 days",
                },
            });

            logWithContext("info", "[TenantInvitation] Invitation sent", {
                tenantUuid: input.tenantUuid,
                email: input.email,
                role: input.role,
            });

            return invitation;

        } catch (error: any) {
            logWithContext("error", "[TenantInvitation] Failed to invite user", {
                error: error.message,
            });
            throw error;
        }
    }

    //Accept invitation
    static async acceptInvitation(input: {
        token: string;
        userUuid?: string; // If user already exists
        userData?: {
            name: string;
            phoneNumber: string;
            password: string;
        };
    }) {
        try {
            const hashedToken = crypto
                .createHash("sha256")
                .update(input.token)
                .digest("hex");

            // Find invitation
            const invitation = await prisma.tenantInvitation.findFirst({
                where: {
                    token: hashedToken,
                    status: "PENDING",
                    expiresAt: { gt: new Date() },
                },
            });

            if (!invitation) {
                throw new Error("INVALID_OR_EXPIRED_INVITATION");
            };

            let user;

            // Check if user exists
            if (input.userUuid) {
                    user = await prisma.user.findUnique({
                    where: { uuid: input.userUuid },
                });

                if (user?.email !== invitation.email) {
                    throw new Error("EMAIL_MISMATCH");
                };
            } else {
                // Create new user
                if (!input.userData) {
                    throw new Error("USER_DATA_REQUIRED");
                };

                user = await prisma.user.create({
                    data: {
                        email: invitation.email,
                        name: input.userData.name,
                        phoneNumber: input.userData.phoneNumber,
                        password: input.userData.password, // Should be hashed
                        isVerified: true,
                        emailVerified: true,
                        globalRole: "CUSTOMER", // They're staff but global role is customer
                    },
                });
            };

            // Create tenant user relationship
            const tenantUser = await prisma.tenantUser.create({
                data: {
                    tenantUuid: invitation.tenantUuid,
                    userUuid: user!.uuid,
                    role: invitation.role,
                    isActive: true,
                    joinedAt: new Date(),
                },
            });

            // Assign store access
            const storeAccess = invitation.storeAccess as string[];
            
            if (storeAccess && storeAccess.length > 0) {
                await prisma.userStore.createMany({
                    data: storeAccess.map((storeUuid) => ({
                        userUuid: user!.uuid,
                        storeUuid,
                        tenantUserUuid: tenantUser.uuid,
                        role: invitation.role,
                    })),
                });
            };

            // Mark invitation as accepted
            await prisma.tenantInvitation.update({
                where: { uuid: invitation.uuid },
                data: {
                    status: "ACCEPTED",
                    acceptedAt: new Date(),
                    acceptedBy: user!.uuid,
                },
            });

            logWithContext("info", "[TenantInvitation] Invitation accepted", {
                invitationUuid: invitation.uuid,
                userUuid: user!.uuid,
            });

            return {
                user,
                tenantUser,
            };
        } catch (error: any) {
            logWithContext("error", "[TenantInvitation] Failed to accept invitation", {
                error: error.message,
            });
            throw error;
        }
    }

    //Revoke invitation
    static async revokeInvitation(input: {
        invitationUuid: string;
        revokedBy: string;
    }) {
        await prisma.tenantInvitation.update({
            where: { uuid: input.invitationUuid },
            data: {
                status: "REVOKED",
                revokedAt: new Date(),
                revokedBy: input.revokedBy,
            },
        });
    
        logWithContext("info", "[TenantInvitation] Invitation revoked", {
            invitationUuid: input.invitationUuid,
        });
    }
 
    //List pending invitations
    static async listInvitations(tenantUuid: string) {
        return prisma.tenantInvitation.findMany({
            where: {
                tenantUuid,
                status: "PENDING",
            },
            orderBy: { createdAt: "desc" },
        });
    }
}
