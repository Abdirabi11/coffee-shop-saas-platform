import jwt from "jsonwebtoken"
import { OAuth2Client } from "google-auth-library";
import prisma from "../../config/prisma.ts"
import { TokenService } from "./Token.service.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";

export class SocialAuthService {
    // Google Sign-In
    static async authenticateWithGoogle(input: { idToken: string; req: any }) {
        const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    
        const ticket = await client.verifyIdToken({
            idToken: input.idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
    
        const payload = ticket.getPayload();
        if (!payload) throw new Error("INVALID_GOOGLE_TOKEN");
    
        const { sub: googleId, email, name, picture } = payload;
    
        // Find or create user
        let user = await prisma.user.findFirst({
            where: {
                OR: [
                ...(email ? [{ email }] : []),
                { socialAccounts: { some: { provider: "GOOGLE", providerId: googleId } } },
                ],
            },
            include: { socialAccounts: true },
        });
    
        let isNewUser = false;
    
        if (!user) {
            user = await prisma.user.create({
                data: {
                    email,
                    name,
                    firstName: name?.split(" ")[0] ?? "",
                    lastName: name?.split(" ").slice(1).join(" ") ?? "",
                    phoneNumber: `google_${googleId}`,
                    isVerified: true,
                    emailVerified: true,
                    globalRole: "CUSTOMER",
                    socialAccounts: {
                        create: {
                            provider: "GOOGLE",
                            providerId: googleId,
                            email,
                            displayName: name,
                            profilePicture: picture,
                        },
                    },
                },
                include: { socialAccounts: true },
            });
            isNewUser = true;
        } else {
            // Update or create social account link
            const existing = user.socialAccounts.find((a) => a.provider === "GOOGLE");
            if (existing) {
                await prisma.socialAccount.update({
                    where: { uuid: existing.uuid },
                    data: { displayName: name, profilePicture: picture, lastLoginAt: new Date() },
                });
            } else {
                await prisma.socialAccount.create({
                    data: {
                        userUuid: user.uuid,
                        provider: "GOOGLE",
                        providerId: googleId,
                        email,
                        displayName: name,
                        profilePicture: picture,
                    },
                });
            }
        }
    
        if (user.isBanned || user.isGloballyBanned) throw new Error("ACCOUNT_BANNED");
    
        // ── FIX: Use TokenService ───────────────────────────────────────
        const tenantUser = await prisma.tenantUser.findFirst({
            where: { userUuid: user.uuid, isActive: true },
            select: { tenantUuid: true },
        });
    
        const tokens = await TokenService.issueTokenPair({
            userUuid: user.uuid,
            tenantUuid: tenantUser?.tenantUuid,
            role: user.globalRole,
            req: input.req,
        });
    
        MetricsService.increment("auth.social.google", 1);
    
        return {
            user,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            isNewUser,
        };
    }
    
    // Apple Sign-In
    static async authenticateWithApple(input: {
        identityToken: string;
        authorizationCode: string;
        user?: { name: { firstName: string; lastName: string }; email: string };
        req: any;
    }) {
        const jwt = await import("jsonwebtoken");
        const decoded = jwt.default.decode(input.identityToken, { complete: true });
        if (!decoded) throw new Error("INVALID_APPLE_TOKEN");
    
        const payload = decoded.payload as any;
        const appleId = payload.sub;
        const email = payload.email;
    
        let user = await prisma.user.findFirst({
            where: {
                OR: [
                    ...(email ? [{ email }] : []),
                    { socialAccounts: { some: { provider: "APPLE", providerId: appleId } } },
                ],
            },
            include: { socialAccounts: true },
        });
    
        let isNewUser = false;
    
        if (!user) {
            const fullName = input.user
                ? `${input.user.name.firstName} ${input.user.name.lastName}`
                : undefined;
        
            user = await prisma.user.create({
                data: {
                    email,
                    name: fullName,
                    firstName: input.user?.name.firstName ?? "",
                    lastName: input.user?.name.lastName ?? "",
                    phoneNumber: `apple_${appleId}`,
                    isVerified: true,
                    emailVerified: !!email,
                    globalRole: "CUSTOMER",
                    socialAccounts: {
                        create: { provider: "APPLE", providerId: appleId, email },
                    },
                },
                include: { socialAccounts: true },
            });
            isNewUser = true;
        } else {
            const existing = user.socialAccounts.find((a) => a.provider === "APPLE");
            if (existing) {
                await prisma.socialAccount.update({
                    where: { uuid: existing.uuid },
                    data: { lastLoginAt: new Date() },
                });
            } else {
                await prisma.socialAccount.create({
                    data: { userUuid: user.uuid, provider: "APPLE", providerId: appleId, email },
                });
            }
        }
    
        if (user.isBanned || user.isGloballyBanned) throw new Error("ACCOUNT_BANNED");
    
        // ── FIX: Use TokenService ───────────────────────────────────────
        const tenantUser = await prisma.tenantUser.findFirst({
            where: { userUuid: user.uuid, isActive: true },
            select: { tenantUuid: true },
        });
    
        const tokens = await TokenService.issueTokenPair({
            userUuid: user.uuid,
            tenantUuid: tenantUser?.tenantUuid,
            role: user.globalRole,
            req: input.req,
        });
    
        MetricsService.increment("auth.social.apple", 1);
    
        return {
            user,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            isNewUser,
        };
    }
    
    // Unlink social account
    static async unlink(input: {
        userUuid: string;
        provider: "GOOGLE" | "APPLE" | "FACEBOOK";
    }) {
        const user = await prisma.user.findUnique({
            where: { uuid: input.userUuid },
            include: { socialAccounts: true },
        });
    
        if (!user) throw new Error("USER_NOT_FOUND");
    
        const hasPassword = !!(user.passwordHash || user.password);
        const hasPhone = !!user.phoneVerified;
    
        if (user.socialAccounts.length === 1 && !hasPassword && !hasPhone) {
            throw new Error("CANNOT_UNLINK_ONLY_LOGIN_METHOD");
        }
    
        await prisma.socialAccount.deleteMany({
            where: { userUuid: input.userUuid, provider: input.provider },
        });
    
        return { success: true };
    }
}