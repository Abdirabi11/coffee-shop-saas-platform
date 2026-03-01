import jwt from "jsonwebtoken"
import { OAuth2Client } from "google-auth-library";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { signAccessToken, signRefreshToken } from "../../utils/jwt.ts";
import { SessionService } from "./Session.service.ts";

export class SocialAuthService {
    
    //Authenticate with Google
    static async authenticateWithGoogle(input: {
      idToken: string;
      req: any;
    }) {
        try {
            const client= new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

            // Verify Google ID token
            const ticket = await client.verifyIdToken({
                idToken: input.idToken,
                audience: process.env.GOOGLE_CLIENT_ID,
            });

            const payload = ticket.getPayload();

            if (!payload) {
                throw new Error("INVALID_GOOGLE_TOKEN");
            };

            const { sub: googleId, email, name, picture } = payload;

            // Find or create user
            let user = await prisma.user.findFirst({
                where: {
                    OR: [
                        { email },
                        {
                            socialAccounts: {
                                some: {
                                    provider: "GOOGLE",
                                    providerId: googleId,
                                },
                            },
                        },
                    ],
                },
                include: {
                    socialAccounts: true,
                },
            });

            if (!user) {
                // Create new user
                user = await prisma.user.create({
                    data: {
                        email,
                        name,
                        phoneNumber: `google_${googleId}`, // Temporary, user can add later
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
                    include: {
                        socialAccounts: true,
                    },
                });
        
                logWithContext("info", "[SocialAuth] New user created via Google", {
                    userUuid: user.uuid,
                    email,
                });
            } else {
                // Update existing social account or create if missing
                const existingAccount = user.socialAccounts.find(
                    (acc) => acc.provider === "GOOGLE"
                );
        
                if (!existingAccount) {
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
                } else {
                    await prisma.socialAccount.update({
                        where: { uuid: existingAccount.uuid },
                        data: {
                            displayName: name,
                            profilePicture: picture,
                            lastLoginAt: new Date(),
                        },
                    });
                };
            };

            // Check if user is banned
            if (user.isBanned || user.isGloballyBanned) {
                throw new Error("ACCOUNT_BANNED");
            }

            // Generate tokens
            const accessToken = signAccessToken({
                userUuid: user.uuid,
                role: user.globalRole,
                tokenVersion: user.tokenVersion,
            });

            const refreshToken = signRefreshToken({
                userUuid: user.uuid,
                tokenVersion: user.tokenVersion,
            });

            // Store refresh token
            const storedToken = await prisma.refreshToken.create({
                data: {
                    token: refreshToken,
                    userUuid: user.uuid,
                    deviceFingerprint: input.req.headers["x-device-fingerprint"] as string || "unknown",
                    deviceId: input.req.headers["x-device-id"] as string || "unknown",
                    issuedFrom: input.req.ip!,
                    userAgent: input.req.headers["user-agent"],
                    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                },
            });

            // Create session
            await SessionService.createUserSession(
                user.uuid,
                storedToken.uuid,
                input.req
            );

            logWithContext("info", "[SocialAuth] Google login successful", {
                userUuid: user.uuid,
            });

            return {
                user,
                accessToken,
                refreshToken,
                isNewUser: !user.socialAccounts.some((acc) => acc.provider === "GOOGLE"),
            };

        } catch (error: any) {
            logWithContext("error", "[SocialAuth] Google login failed", {
                error: error.message,
            });
            throw error;
        }
    }

    //Authenticate with Apple
    static async authenticateWithApple(input: {
        identityToken: string;
        authorizationCode: string;
        user?: {
            name: {
                firstName: string;
                lastName: string;
            };
            email: string;
        };
        req: any;
    }) {
        try {
            // Verify Apple identity token
            const decoded = jwt.decode(input.identityToken, { complete: true });

            if (!decoded) {
              throw new Error("INVALID_APPLE_TOKEN");
            }
      
            const payload = decoded.payload as any;
            const appleId = payload.sub;
            const email = payload.email;

            // Find or create user
            let user = await prisma.user.findFirst({
                where: {
                    OR: [
                        { email },
                        {
                        socialAccounts: {
                            some: {
                            provider: "APPLE",
                            providerId: appleId,
                            },
                        },
                        },
                    ],
                },
                include: {
                    socialAccounts: true,
                },
            });

            if (!user) {
                const name = input.user
                    ? `${input.user.name.firstName} ${input.user.name.lastName}`
                    : undefined;

                user = await prisma.user.create({
                    data: {
                        email,
                        name,
                        phoneNumber: `apple_${appleId}`,
                        isVerified: true,
                        emailVerified: !!email,
                        globalRole: "CUSTOMER",
                        socialAccounts: {
                        create: {
                            provider: "APPLE",
                            providerId: appleId,
                            email,
                            displayName: name,
                        },
                        },
                    },
                    include: {
                        socialAccounts: true,
                    },
                });

                logWithContext("info", "[SocialAuth] New user created via Apple", {
                    userUuid: user.uuid,
                    email,
                });
            } else {
                const existingAccount = user.socialAccounts.find(
                    (acc) => acc.provider === "APPLE"
                );
        
                if (!existingAccount) {
                    await prisma.socialAccount.create({
                        data: {
                            userUuid: user.uuid,
                            provider: "APPLE",
                            providerId: appleId,
                            email,
                        },
                    });
                } else {
                    await prisma.socialAccount.update({
                        where: { uuid: existingAccount.uuid },
                        data: {
                            lastLoginAt: new Date(),
                        },
                    });
                }
            };
        
            // Check if banned
            if (user.isBanned || user.isGloballyBanned) {
                throw new Error("ACCOUNT_BANNED");
            };
        
            // Generate tokens
            const accessToken = signAccessToken({
                userUuid: user.uuid,
                role: user.globalRole,
                tokenVersion: user.tokenVersion,
            });
    
            const refreshToken = signRefreshToken({
                userUuid: user.uuid,
                tokenVersion: user.tokenVersion,
            });
        
            // Store refresh token
            const storedToken = await prisma.refreshToken.create({
                data: {
                    token: refreshToken,
                    userUuid: user.uuid,
                    deviceFingerprint: input.req.headers["x-device-fingerprint"] as string || "unknown",
                    deviceId: input.req.headers["x-device-id"] as string || "unknown",
                    issuedFrom: input.req.ip!,
                    userAgent: input.req.headers["user-agent"],
                    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                },
            });
        
            // Create session
            await SessionService.createUserSession(
                user.uuid,
                storedToken.uuid,
                input.req
            );
        
            logWithContext("info", "[SocialAuth] Apple login successful", {
                userUuid: user.uuid,
            });
        
            return {
                user,
                accessToken,
                refreshToken,
                isNewUser: !user.socialAccounts.some((acc) => acc.provider === "APPLE"),
            };
      
        } catch (error: any) {
            logWithContext("error", "[SocialAuth] Apple login failed", {
                error: error.message,
            });
            throw error;
        }
    }

    //Unlink social account
    static async unlinkSocialAccount(input: {
        userUuid: string;
        provider: "GOOGLE" | "APPLE" | "FACEBOOK";
    }) {
        try {
            // Check if user has other login methods
            const user = await prisma.user.findUnique({
                where: { uuid: input.userUuid },
                include: {
                    socialAccounts: true,
                },
            });

            if (!user) {
                throw new Error("USER_NOT_FOUND");
            };

            // Don't allow unlinking if it's the only login method
            if (
                user.socialAccounts.length === 1 &&
                !user.password &&
                !user.phoneVerified
            ) {
                throw new Error("CANNOT_UNLINK_ONLY_LOGIN_METHOD");
            };

            await prisma.socialAccount.deleteMany({
                where: {
                    userUuid: input.userUuid,
                    provider: input.provider,
                },
            });

            logWithContext("info", "[SocialAuth] Social account unlinked", {
                userUuid: input.userUuid,
                provider: input.provider,
            });
        
            return { success: true };
        } catch (error:any) {
            logWithContext("error", "[SocialAuth] Failed to unlink social account", {
                error: error.message,
            });
            throw error;
        }
    }
}