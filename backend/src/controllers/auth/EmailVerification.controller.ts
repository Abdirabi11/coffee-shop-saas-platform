import { Request, Response } from "express";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { EmailVerificationService } from "../../services/auth/EmailVerification.service.ts";

export class EmailVerificationController {

    //POST /api/auth/email/send-verification
    //Send verification email
    static async sendVerification(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `email_${Date.now()}`;

        try {
            const userUuid = req.user!.uuid;

            await EmailVerificationService.sendVerificationEmail(userUuid);

            return res.status(200).json({
                success: true,
                message: "Verification email sent",
            });
        } catch (error: any) {
            logWithContext("error", "[EmailVerification] Failed to send", {
                traceId,
                error: error.message,
            });
        
            const errorMap: Record<string, any> = {
                USER_OR_EMAIL_NOT_FOUND: {
                    status: 404,
                    error: "USER_OR_EMAIL_NOT_FOUND",
                    message: "User or email not found",
                },
                EMAIL_ALREADY_VERIFIED: {
                    status: 400,
                    error: "EMAIL_ALREADY_VERIFIED",
                    message: "Email is already verified",
                },
            };
    
            const errorResponse = errorMap[error.message] || {
                status: 500,
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to send verification email",
            };
    
            return res.status(errorResponse.status).json(errorResponse);
        }
    }

    //GET /api/auth/email/verify
    //Verify email with token
    static async verifyEmail(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `email_${Date.now()}`;
    
        try {
            const { token } = req.query;

            if (!token) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "Token is required",
                });
            }

            const result = await EmailVerificationService.verifyEmail(token as string);

            return res.status(200).json({
                success: true,
                message: "Email verified successfully",
                user: result.user,
            });

        } catch (error: any) {
            logWithContext("error", "[EmailVerification] Verification failed", {
                traceId,
                error: error.message,
            });

            if (error.message === "INVALID_OR_EXPIRED_TOKEN") {
                return res.status(400).json({
                    error: "INVALID_OR_EXPIRED_TOKEN",
                    message: "Invalid or expired verification token",
                });
            }

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Email verification failed",
            });
        }
    }

    //POST /api/auth/email/resend-verification
    //Resend verification email
    static async resendVerification(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `email_${Date.now()}`;
    
        try {
            const userUuid = req.user!.uuid;

            await EmailVerificationService.resendVerificationEmail(userUuid);

            return res.status(200).json({
                success: true,
                message: "Verification email resent",
            });

        } catch (error: any) {
            logWithContext("error", "[EmailVerification] Resend failed", {
                traceId,
                error: error.message,
            });

            if (error.message === "RATE_LIMIT_EXCEEDED") {
                return res.status(429).json({
                    error: "RATE_LIMIT_EXCEEDED",
                    message: "Too many requests. Please try again later.",
                });
            }

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to resend verification email",
            });
        }
    }
}