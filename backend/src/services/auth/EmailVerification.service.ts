import crypto from "crypto";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";
import { EmailService } from "../notification/Email.service.ts";


export class EmailVerificationService {
  
    //Send verification email
    static async sendVerificationEmail(userUuid: string) {
        try {
            const user = await prisma.user.findUnique({
                where: { uuid: userUuid },
                select: {
                    email: true,
                    emailVerified: true,
                },
            });
        
            if (!user || !user.email) {
                throw new Error("USER_OR_EMAIL_NOT_FOUND");
            };
        
            if (user.emailVerified) {
                throw new Error("EMAIL_ALREADY_VERIFIED");
            };
        
            // Generate verification token
            const verificationToken = crypto.randomBytes(32).toString("hex");
            const hashedToken = crypto
                .createHash("sha256")
                .update(verificationToken)
                .digest("hex");
    
            // Store token
            await prisma.user.update({
                where: { uuid: userUuid },
                data: {
                    emailVerificationToken: hashedToken,
                    emailTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
                },
            });
    
            // Send email
            const verificationLink = `${process.env.APP_URL}/verify-email?token=${verificationToken}`;
    
            await EmailService.send({
                to: user.email,
                subject: "Verify Your Email Address",
                template: "email-verification",
                data: {
                    verificationLink,
                    expiresIn: "24 hours",
                },
            });

            logWithContext("info", "[EmailVerification] Verification email sent", {
                userUuid,
                email: user.email,
            });
        
            MetricsService.increment("email_verification.sent", 1);
        
            return { success: true };
        } catch (error: any) {
            logWithContext("error", "[EmailVerification] Failed to send verification email", {
                error: error.message,
                userUuid,
            });
        
            MetricsService.increment("email_verification.failed", 1);
        
            throw error;
        }
    }

    //Verify email with token
    static async verifyEmail(token: string) {
        try {
            const hashedToken = crypto
                .createHash("sha256")
                .update(token)
                .digest("hex");

            // Find user with valid token
            const user = await prisma.user.findFirst({
                where: {
                    emailVerificationToken: hashedToken,
                    emailTokenExpiry: { gt: new Date() },
                },
            });

            if (!user) {
                throw new Error("INVALID_OR_EXPIRED_TOKEN");
            };
        
            // Mark email as verified
            await prisma.user.update({
                where: { uuid: user.uuid },
                data: {
                    emailVerified: true,
                    emailVerificationToken: null,
                    emailTokenExpiry: null,
                },
            });
        
            logWithContext("info", "[EmailVerification] Email verified", {
                userUuid: user.uuid,
                email: user.email,
            });

            MetricsService.increment("email_verification.success", 1);

            return {
                success: true,
                user: {
                    uuid: user.uuid,
                    email: user.email,
                    emailVerified: true,
                },
            };
        } catch (error: any) {
            logWithContext("error", "[EmailVerification] Verification failed", {
                error: error.message,
            });
        
            throw error;
        }
    }

    //Resend verification email
    static async resendVerificationEmail(userUuid: string) {
        try {
            // Check rate limiting (max 3 emails per hour)
            const recentEmails = await prisma.emailLog.count({
                where: {
                    userUuid,
                    type: "EMAIL_VERIFICATION",
                    createdAt: {
                        gte: new Date(Date.now() - 60 * 60 * 1000),
                    },
                },
            });

            if (recentEmails >= 3) {
                throw new Error("RATE_LIMIT_EXCEEDED");
            };

            // Send email
            await this.sendVerificationEmail(userUuid);

            // Log email
            await prisma.emailLog.create({
                data: {
                    userUuid,
                    type: "EMAIL_VERIFICATION",
                    status: "SENT",
                },
            });

            return { success: true };

        } catch (error: any) {
            logWithContext("error", "[EmailVerification] Failed to resend email", {
                error: error.message,
                userUuid,
            });

            throw error;
        }
    }

    //Check if email is verified
    static async isEmailVerified(userUuid: string): Promise<boolean> {
        const user = await prisma.user.findUnique({
            where: { uuid: userUuid },
            select: { emailVerified: true },
        });

        return user?.emailVerified || false;
    }
}