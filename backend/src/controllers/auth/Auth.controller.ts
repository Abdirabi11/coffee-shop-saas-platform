import { Request, Response } from "express";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { AuthService } from "../../services/auth/Auth.service.ts";
import { SessionService } from "../../services/auth/Session.service.ts";
import { TokenService } from "../../services/auth/Token.service.ts";
import { DeviceTrustService } from "../../services/security/deviceTrust.service.ts";
import { requestLoginOtpSchema, verifyLoginOtpSchema } from "../../validators/auth.validator.ts";
import { verifySignupSchema } from "../../validators/auth.validator.ts";
import { requestSignupOtpSchema } from "../../validators/auth.validator.ts";
import { FraudService } from "../../services/security/Fraud.service.js";


export class AuthController {
  
    //POST /auth/signup/request-otp
    //Request OTP for signup
    static async requestSignupOtp(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `auth_${Date.now()}`;

        try {
            // Validate input
            const validation = requestSignupOtpSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    details: validation.error.errors,
                });
            }

            const { phoneNumber, method, email } = validation.data;

            await AuthService.requestSignupOtp({
                phoneNumber,
                method,
                email,
            });

            logWithContext("info", "[Auth] Signup OTP requested", {
                traceId,
                phoneNumber,
            });

            return res.status(200).json({
                success: true,
                message: "OTP sent successfully",
            });
        } catch (error: any) {
            logWithContext("error", "[Auth] Failed to request signup OTP", {
                traceId,
                error: error.message,
            });
        
            if (error.message === "PHONE_ALREADY_REGISTERED") {
                return res.status(409).json({
                    error: "PHONE_ALREADY_REGISTERED",
                    message: "This phone number is already registered",
                });
            };
        
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to send OTP",
            });
        }
    } 

    //POST /auth/signup/verify
    //Verify signup OTP and complete registration
    static async verifySignup(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `auth_${Date.now()}`;

        try {
            // Validate input
            const validation = verifySignupSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    details: validation.error.errors,
                });
            };

            const { phoneNumber, code, name, email } = validation.data;

            const result = await AuthService.verifySignup({
                phoneNumber,
                code,
                name,
                email,
                req,
            });

            logWithContext("info", "[Auth] Signup verified", {
                traceId,
                userUuid: result.user.uuid,
            });

            // Set refresh token in httpOnly cookie
            res.cookie("refreshToken", result.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
            });

            return res.status(201).json({
                success: true,
                user: {
                    uuid: result.user.uuid,
                    phoneNumber: result.user.phoneNumber,
                    name: result.user.name,
                    email: result.user.email,
                    role: result.user.globalRole,
                },
                accessToken: result.accessToken,
            });
        } catch (error: any) {
            logWithContext("error", "[Auth] Signup verification failed", {
                traceId,
                error: error.message,
            });
        
            const errorMap: Record<string, { status: number; error: string; message: string }> = {
                OTP_NOT_REQUESTED: {
                    status: 400,
                    error: "OTP_NOT_REQUESTED",
                    message: "Please request OTP first",
                },
                PHONE_ALREADY_REGISTERED: {
                    status: 409,
                    error: "PHONE_ALREADY_REGISTERED",
                    message: "This phone number is already registered",
                },
                TOO_MANY_ATTEMPTS: {
                    status: 429,
                    error: "TOO_MANY_ATTEMPTS",
                    message: "Too many attempts. Please try again later.",
                },
                OTP_EXPIRED: {
                    status: 400,
                    error: "OTP_EXPIRED",
                    message: "OTP has expired. Please request a new one.",
                },
                INVALID_OTP: {
                    status: 400,
                    error: "INVALID_OTP",
                    message: "Invalid OTP code",
                },
            };
        
            const errorResponse = errorMap[error.message] || {
                status: 500,
                error: "INTERNAL_SERVER_ERROR",
                message: "Signup verification failed",
            };
        
            return res.status(errorResponse.status).json(errorResponse);
        }
    }
     
    //POST /auth/login/request-otp
    //Request OTP for login
    static async requestLoginOtp(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `auth_${Date.now()}`;
    
        try {
            // Validate input
            const validation = requestLoginOtpSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    details: validation.error.errors,
                });
            }

            const { phoneNumber } = validation.data;

            const result = await AuthService.requestLoginOtp({
                phoneNumber,
                ipAddress: req.ip!,
                userAgent: req.headers["user-agent"],
                deviceFingerprint: req.headers["x-device-fingerprint"] as string,
            });

            logWithContext("info", "[Auth] Login OTP requested", {
                traceId,
                phoneNumber,
            });

            return res.status(200).json({
                success: true,
                attemptUuid: result.attemptUuid,
                message: "OTP sent successfully",
            });

        } catch (error: any) {
            logWithContext("error", "[Auth] Failed to request login OTP", {
                traceId,
                error: error.message,
            });

            const errorMap: Record<string, { status: number; error: string; message: string }> = {
                USER_NOT_FOUND: {
                    status: 404,
                    error: "USER_NOT_FOUND",
                    message: "User not found",
                },
                ACCOUNT_BANNED: {
                    status: 403,
                    error: "ACCOUNT_BANNED",
                    message: "Your account has been banned",
                },
                ACCOUNT_LOCKED: {
                    status: 403,
                    error: "ACCOUNT_LOCKED",
                    message: "Account temporarily locked. Please try again later.",
                },
                RATE_LIMIT_EXCEEDED: {
                    status: 429,
                    error: "RATE_LIMIT_EXCEEDED",
                    message: "Too many attempts. Please try again later.",
                },
            };

            const errorResponse = errorMap[error.message] || {
                status: 500,
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to send OTP",
            };

            return res.status(errorResponse.status).json(errorResponse);
        }
    }

    //POST /auth/login/verify
    //Verify login OTP
   
    static async verifyLoginOtp(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `auth_${Date.now()}`;
        
        try {
            // Validate input
            const validation = verifyLoginOtpSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    details: validation.error.errors,
                });
            }

            const { attemptUuid, code } = validation.data;

            const result = await AuthService.verifyLoginOtp({
                attemptUuid,
                code,
                req,
            });

            logWithContext("info", "[Auth] Login verified", {
                traceId,
                userUuid: result.user.uuid,
            });

            // Set refresh token in httpOnly cookie
            res.cookie("refreshToken", result.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
            });

            return res.status(200).json({
                success: true,
                user: {
                    uuid: result.user.uuid,
                    phoneNumber: result.user.phoneNumber,
                    name: result.user.name,
                    email: result.user.email,
                    role: result.user.globalRole,
                },
                accessToken: result.accessToken,
            });

        } catch (error: any) {
            logWithContext("error", "[Auth] Login verification failed", {
                traceId,
                error: error.message,
            });

            const errorMap: Record<string, { status: number; error: string; message: string }> = {
                INVALID_ATTEMPT: {
                    status: 400,
                    error: "INVALID_ATTEMPT",
                    message: "Invalid or expired attempt",
                },
                TOO_MANY_ATTEMPTS: {
                    status: 429,
                    error: "TOO_MANY_ATTEMPTS",
                    message: "Too many attempts. Please try again later.",
                },
                OTP_EXPIRED: {
                    status: 400,
                    error: "OTP_EXPIRED",
                    message: "OTP has expired. Please request a new one.",
                },
                INVALID_OTP: {
                    status: 400,
                    error: "INVALID_OTP",
                    message: "Invalid OTP code",
                },
                ACCOUNT_BANNED: {
                    status: 403,
                    error: "ACCOUNT_BANNED",
                    message: "Your account has been banned",
                },
            };

            const errorResponse = errorMap[error.message] || {
                status: 500,
                error: "INTERNAL_SERVER_ERROR",
                message: "Login verification failed",
            };

            return res.status(errorResponse.status).json(errorResponse);
        }
    }

    //POST /auth/refresh
    //Refresh access token
    static async refreshToken(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `auth_${Date.now()}`;
        
        try {
            // Get refresh token from cookie or body
            const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

            if (!refreshToken) {
                return res.status(401).json({
                    error: "NO_REFRESH_TOKEN",
                    message: "Refresh token required",
                });
            }

            const result = await TokenService.rotateRefreshToken({
                token: refreshToken,
                req,
            });

            logWithContext("info", "[Auth] Token refreshed", {
                traceId,
                userUuid: result.user.uuid,
            });

            // Set new refresh token in cookie
            res.cookie("refreshToken", result.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: 30 * 24 * 60 * 60 * 1000,
            });

            return res.status(200).json({
                success: true,
                accessToken: result.accessToken,
            });

        } catch (error: any) {
            logWithContext("error", "[Auth] Token refresh failed", {
                traceId,
                error: error.message,
            });

            const errorMap: Record<string, { status: number; error: string; message: string }> = {
                TOKEN_NOT_FOUND: {
                    status: 401,
                    error: "TOKEN_NOT_FOUND",
                    message: "Invalid refresh token",
                },
                TOKEN_REUSED: {
                    status: 401,
                    error: "TOKEN_REUSED",
                    message: "Token reuse detected. Please login again.",
                },
                TOKEN_VERSION_MISMATCH: {
                    status: 401,
                    error: "TOKEN_VERSION_MISMATCH",
                    message: "Token version mismatch. Please login again.",
                },
                ACCOUNT_BANNED: {
                    status: 403,
                    error: "ACCOUNT_BANNED",
                    message: "Your account has been banned",
                },
            };

            const errorResponse = errorMap[error.message] || {
                status: 500,
                error: "INTERNAL_SERVER_ERROR",
                message: "Token refresh failed",
            };

            // Clear refresh token cookie on error
            res.clearCookie("refreshToken");

            return res.status(errorResponse.status).json(errorResponse);
        }
    }

    //POST /auth/logout
    //Logout current session
    static async logout(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `auth_${Date.now()}`;
        
        try {
            const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

            if (refreshToken) {
                const session = await SessionService.getSessionByRefreshToken(refreshToken);

                if (session) {
                    await SessionService.revokeSession({
                        sessionUuid: session.uuid,
                        revokedBy: req.user?.uuid || "USER",
                        reason: "User logout",
                    });
                }
            };

            // Clear cookie
            res.clearCookie("refreshToken");

            logWithContext("info", "[Auth] User logged out", {
                traceId,
                userUuid: req.user?.uuid,
            });

            return res.status(200).json({
                success: true,
                message: "Logged out successfully",
            });

        } catch (error: any) {
            logWithContext("error", "[Auth] Logout failed", {
                traceId,
                error: error.message,
            });

            // Clear cookie anyway
            res.clearCookie("refreshToken");

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Logout failed",
            });
        }
    }

    //POST /auth/logout-all
    //Logout all sessions
    static async logoutAll(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `auth_${Date.now()}`;
        
        try {
            const userUuid = req.user!.uuid;

            await SessionService.revokeAllSessions({
                userUuid,
                revokedBy: userUuid,
                reason: "User logged out all sessions",
            });

            // Clear cookie
            res.clearCookie("refreshToken");

            logWithContext("info", "[Auth] All sessions logged out", {
                traceId,
                userUuid,
            });

            return res.status(200).json({
                success: true,
                message: "All sessions logged out successfully",
            });

        } catch (error: any) {
            logWithContext("error", "[Auth] Logout all failed", {
                traceId,
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Logout all sessions failed",
            });
        }
    }

    //GET /auth/me
    //Get current user
    static async getMe(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `auth_${Date.now()}`;
        
        try {
            const userUuid = req.user!.uuid;

            const user = await prisma.user.findUnique({
                where: { uuid: userUuid },
                select: {
                    uuid: true,
                    phoneNumber: true,
                    email: true,
                    name: true,
                    globalRole: true,
                    isVerified: true,
                    createdAt: true,
                    tenantUsers: {
                        where: { isActive: true },
                        include: {
                            tenant: {
                                select: {
                                    uuid: true,
                                    name: true,
                                    slug: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!user) {
                return res.status(404).json({
                    error: "USER_NOT_FOUND",
                    message: "User not found",
                });
            }

            return res.status(200).json({
                success: true,
                user,
            });

        } catch (error: any) {
            logWithContext("error", "[Auth] Failed to get user", {
                traceId,
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to retrieve user",
            });
        }
    }

    //GET /auth/sessions
    //Get user sessions
    static async getSessions(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `auth_${Date.now()}`;
        
        try {
            const userUuid = req.user!.uuid;

            const sessions = await SessionService.listSessions({
                userUuid,
                includeRevoked: false,
            });

            return res.status(200).json({
                success: true,
                sessions,
            });

        } catch (error: any) {
            logWithContext("error", "[Auth] Failed to get sessions", {
                traceId,
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to retrieve sessions",
            });
        }
    }

    //DELETE /auth/sessions/:sessionUuid
    static async revokeSession(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `auth_${Date.now()}`;
        
        try {
            const { sessionUuid } = req.params;
            const userUuid = req.user!.uuid;

            // Verify session belongs to user
            const session = await prisma.session.findFirst({
                where: {
                    uuid: sessionUuid,
                    userUuid,
                },
            });

            if (!session) {
                return res.status(404).json({
                    error: "SESSION_NOT_FOUND",
                    message: "Session not found",
                });
            }

            await SessionService.revokeSession({
                sessionUuid,
                revokedBy: userUuid,
                reason: "User revoked session",
            });

            logWithContext("info", "[Auth] Session revoked", {
                traceId,
                sessionUuid,
            });

            return res.status(200).json({
                success: true,
                message: "Session revoked successfully",
            });

        } catch (error: any) {
            logWithContext("error", "[Auth] Failed to revoke session", {
                traceId,
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to revoke session",
            });
        }
    }

    //GET /auth/devices
    static async getTrustedDevices(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `auth_${Date.now()}`;
        
        try {
            const userUuid = req.user!.uuid;

            const devices = await DeviceTrustService.listTrustedDevices(userUuid);

            return res.status(200).json({
                success: true,
                devices,
            });

        } catch (error: any) {
            logWithContext("error", "[Auth] Failed to get devices", {
                traceId,
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to retrieve devices",
            });
        }
    }

    //DELETE /auth/devices/:deviceUuid
    static async revokeDeviceTrust(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `auth_${Date.now()}`;
        
        try {
            const { deviceUuid } = req.params;
            const userUuid = req.user!.uuid;

            await DeviceTrustService.revokeDeviceTrust({
                userUuid,
                deviceUuid,
                revokedBy: userUuid,
            });

            logWithContext("info", "[Auth] Device trust revoked", {
                traceId,
                deviceUuid,
            });

            return res.status(200).json({
                success: true,
                message: "Device trust revoked successfully",
            });

        } catch (error: any) {
            logWithContext("error", "[Auth] Failed to revoke device trust", {
                traceId,
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to revoke device trust",
            });
        }
    }
}