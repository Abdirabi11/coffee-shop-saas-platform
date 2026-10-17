import crypto from "crypto";
import bcrypt from "bcrypt";
import { Prisma, type StoreRole, type TenantRole } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { EmailService } from "../notification/Email.service.ts";
import { PlanLimitService } from "../billing/PlanLimit.service.ts";


// Store-level role an invitee gets at each store they're given
const STORE_ROLE_FOR_TENANT_ROLE: Record<TenantRole, StoreRole> = {
    TENANT_ADMIN: "ADMIN",
    REGIONAL_MANAGER: "MANAGER",
    STAFF: "STAFF",
};

export class TenantInvitationService{
    //Invite user to tenant
    static async inviteUser(input: {
        tenantUuid: string;
        email: string;
        role: TenantRole;
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

            // Create invitation. An invitee with store access becomes staff,
            // so open invitations count against the plan's staff limit too;
            // checked under the plan lock with the insert.
            const invitation = await prisma.$transaction(async (tx) => {
                if (input.storeUuids.length > 0) {
                    const pending = await tx.tenantInvitation.count({
                        where: {
                            tenantUuid: input.tenantUuid,
                            status: "PENDING",
                            expiresAt: { gt: new Date() },
                        },
                    });
                    await PlanLimitService.assertCanAdd(tx, input.tenantUuid, "maxStaff", { pending });
                }

                return tx.tenantInvitation.create({
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
    //
    // Either as the signed-in user (userUuid from their verified token; the
    // account's email must be the invited one), or by creating an account
    // for the invited email. One transaction: the invitation is claimed
    // first (PENDING -> ACCEPTED, so it can only be used once), then the
    // membership and store access are written, within the plan's staff limit.
    static async acceptInvitation(input: {
        token: string;
        userUuid?: string;
        newUser?: {
            firstName: string;
            lastName: string;
            phoneNumber: string;
            password: string;
        };
    }) {
        if (!input.userUuid && !input.newUser) {
            throw new Error("USER_DATA_REQUIRED");
        }

        const hashedToken = crypto
            .createHash("sha256")
            .update(input.token)
            .digest("hex");

        // Before the transaction: hashing is slow and needs no lock
        const passwordHash = input.newUser
            ? await bcrypt.hash(input.newUser.password, 12)
            : undefined;

        try {
            const result = await prisma.$transaction(async (tx) => {
                const now = new Date();
                const invitation = await tx.tenantInvitation.findFirst({
                    where: { token: hashedToken, status: "PENDING", expiresAt: { gt: now } },
                });
                if (!invitation) {
                    throw new Error("INVALID_OR_EXPIRED_INVITATION");
                }

                // Of two concurrent accepts, one claims it; the other finds it gone
                const claim = await tx.tenantInvitation.updateMany({
                    where: { uuid: invitation.uuid, status: "PENDING" },
                    data: { status: "ACCEPTED", acceptedAt: now },
                });
                if (claim.count === 0) {
                    throw new Error("INVALID_OR_EXPIRED_INVITATION");
                }

                const invitedEmail = invitation.email.toLowerCase();
                let user;

                if (input.userUuid) {
                    user = await tx.user.findUnique({ where: { uuid: input.userUuid } });
                    if (!user || user.email?.toLowerCase() !== invitedEmail) {
                        throw new Error("EMAIL_MISMATCH");
                    }
                } else {
                    const newUser = input.newUser!;
                    const taken = await tx.user.findFirst({
                        where: {
                            OR: [
                                { email: { equals: invitation.email, mode: "insensitive" } },
                                { phoneNumber: newUser.phoneNumber },
                            ],
                        },
                        select: { email: true },
                    });
                    if (taken?.email?.toLowerCase() === invitedEmail) {
                        // That person has an account: they accept signed in
                        throw new Error("ACCOUNT_EXISTS");
                    }
                    if (taken) {
                        throw new Error("PHONE_ALREADY_REGISTERED");
                    }

                    user = await tx.user.create({
                        data: {
                            email: invitation.email,
                            phoneNumber: newUser.phoneNumber,
                            firstName: newUser.firstName,
                            lastName: newUser.lastName,
                            name: `${newUser.firstName} ${newUser.lastName}`,
                            passwordHash,
                            // The invitation reached this address
                            isVerified: true,
                            emailVerified: true,
                            globalRole: "CUSTOMER", // They're staff but global role is customer
                        },
                    });
                }

                const existingMember = await tx.tenantUser.findUnique({
                    where: { tenantUuid_userUuid: { tenantUuid: invitation.tenantUuid, userUuid: user.uuid } },
                });
                if (existingMember?.isActive) {
                    throw new Error("USER_ALREADY_MEMBER");
                }

                // Only stores still in this tenant
                const storeUuids = Array.isArray(invitation.storeAccess)
                    ? (invitation.storeAccess as unknown[]).filter((s): s is string => typeof s === "string")
                    : [];
                const stores = storeUuids.length > 0
                    ? await tx.store.findMany({
                        where: { uuid: { in: storeUuids }, tenantUuid: invitation.tenantUuid },
                        select: { uuid: true },
                    })
                    : [];

                // With store access they become staff, which the plan limits
                if (stores.length > 0) {
                    await PlanLimitService.assertCanAdd(tx, invitation.tenantUuid, "maxStaff");
                }

                // A former member (inactive) is brought back rather than duplicated
                const tenantUser = existingMember
                    ? await tx.tenantUser.update({
                        where: { uuid: existingMember.uuid },
                        data: { role: invitation.role, isActive: true, startDate: now, endDate: null },
                    })
                    : await tx.tenantUser.create({
                        data: {
                            tenantUuid: invitation.tenantUuid,
                            userUuid: user.uuid,
                            slug: `${user.firstName}-${user.lastName}`
                                .toLowerCase()
                                .replace(/[^a-z0-9]+/g, "-")
                                .replace(/(^-|-$)/g, "") + `-${crypto.randomBytes(3).toString("hex")}`,
                            role: invitation.role,
                            isActive: true,
                            startDate: now,
                        },
                    });

                // Store access at the store role matching the invited tenant role
                const storeRole = STORE_ROLE_FOR_TENANT_ROLE[invitation.role];
                for (const store of stores) {
                    await tx.userStore.upsert({
                        where: { userUuid_storeUuid: { userUuid: user.uuid, storeUuid: store.uuid } },
                        update: { isActive: true, role: storeRole, tenantUserUuid: tenantUser.uuid },
                        create: {
                            userUuid: user.uuid,
                            storeUuid: store.uuid,
                            tenantUuid: invitation.tenantUuid,
                            tenantUserUuid: tenantUser.uuid,
                            role: storeRole,
                            isActive: true,
                            startDate: now,
                        },
                    });
                }

                await tx.tenantInvitation.update({
                    where: { uuid: invitation.uuid },
                    data: { acceptedBy: user.uuid },
                });

                return {
                    invitationUuid: invitation.uuid,
                    tenantUuid: invitation.tenantUuid,
                    tenantUserUuid: tenantUser.uuid,
                    role: tenantUser.role,
                    storeUuids: stores.map((s) => s.uuid),
                    // Never the password hash or other account internals
                    user: {
                        uuid: user.uuid,
                        email: user.email,
                        firstName: user.firstName,
                        lastName: user.lastName,
                    },
                };
            });

            logWithContext("info", "[TenantInvitation] Invitation accepted", {
                invitationUuid: result.invitationUuid,
                userUuid: result.user.uuid,
            });

            return result;
        } catch (error: any) {
            logWithContext("error", "[TenantInvitation] Failed to accept invitation", {
                error: error.message,
            });
            // A concurrent signup took the email or phone first
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                throw new Error("ACCOUNT_EXISTS");
            }
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
