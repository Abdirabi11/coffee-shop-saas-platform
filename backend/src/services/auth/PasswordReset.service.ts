import bcrypt from "bcrypt";
import crypto from "crypto";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { SMSService } from "../notification/sms.service.ts";
import { EmailService } from "../notification/Email.service.ts";

export class PasswordResetService{
    static async requestReset(input: {
        phoneNumber?: string;
        email?: string;
        method: "EMAIL" | "SMS";
    }) {
        try {
            const user = await prisma.user.findFirst({
                where: {
                    OR: [
                        { phoneNumber: input.phoneNumber },
                        { email: input.email },
                    ],
                },
            });
        
            if (!user) {
                // Don't reveal if user exists
                return { success: true };
            };
        
            if (user.isBanned || user.isGloballyBanned) {
                throw new Error("ACCOUNT_BANNED");
            };

            // Generate reset token
            const resetToken = crypto.randomBytes(32).toString("hex");
            const hashedToken = crypto
                .createHash("sha256")
                .update(resetToken)
                .digest("hex");

            // Store token
            await prisma.user.update({
                where: { uuid: user.uuid },
                data: {
                    resetToken: hashedToken,
                    resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
                },
            });

            // Send reset link/code
            if (input.method === "EMAIL" && user.email) {
                const resetLink = `${process.env.APP_URL}/reset-password?token=${resetToken}`;
                
                await EmailService.send({
                    to: user.email,
                    subject: "Reset Your Password",
                    template: "password-reset",
                    data: {
                        resetLink,
                        expiresIn: "1 hour",
                    },
                });
            } else if (input.method === "SMS" && user.phoneNumber) {
                // Send 6-digit code via SMS
                const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
                const hashedCode = await bcrypt.hash(resetCode, 10);

                await prisma.user.update({
                    where: { uuid: user.uuid },
                    data: {
                        resetToken: hashedCode,
                        resetTokenExpiry: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
                    },
                });

                await SMSService.send({
                    to: user.phoneNumber,
                    message: `Your password reset code is: ${resetCode}. Valid for 15 minutes.`,
                });
            };

            logWithContext("info", "[PasswordReset] Reset requested", {
                userUuid: user.uuid,
                method: input.method,
            });

            return { success: true };

        } catch (error: any) {
            logWithContext("error", "[PasswordReset] Request failed", {
                error: error.message,
            });
            throw error;
        }
    }

    //Reset password with token
    static async resetPassword(input: {
        token: string;
        newPassword: string;
    }) {
        try {
            const hashedToken = crypto
                .createHash("sha256")
                .update(input.token)
                .digest("hex");

            // Find user with valid token
            const user = await prisma.user.findFirst({
                where: {
                    resetToken: hashedToken,
                    resetTokenExpiry: { gt: new Date() },
                },
            });

            if (!user) {
                throw new Error("INVALID_OR_EXPIRED_TOKEN");
            };

            // Validate password strength
            if (input.newPassword.length < 8) {
                throw new Error("PASSWORD_TOO_WEAK");
            }

            // Hash new password
            const hashedPassword = await bcrypt.hash(input.newPassword, 12);

            // Update password and invalidate all tokens
            await prisma.user.update({
                where: { uuid: user.uuid },
                data: {
                    password: hashedPassword,
                    resetToken: null,
                    resetTokenExpiry: null,
                    tokenVersion: { increment: 1 }, // Invalidate all refresh tokens
                    passwordChangedAt: new Date(),
                },
            });

            // Revoke all sessions
            await prisma.refreshToken.updateMany({
                where: { userUuid: user.uuid },
                data: {
                    status: "REVOKED",
                    revoked: true,
                    revokedAt: new Date(),
                    revokedBy: "SYSTEM",
                    revokedReason: "PASSWORD_CHANGED",
                },
            });

            await prisma.session.updateMany({
                where: { userUuid: user.uuid },
                data: {
                    status: "REVOKED",
                    revoked: true,
                    revokedAt: new Date(),
                    revokedBy: "SYSTEM",
                    revokedReason: "Password changed",
                },
            });

            logWithContext("info", "[PasswordReset] Password reset successful", {
                userUuid: user.uuid,
            });

            // Send confirmation email/SMS
            if (user.email) {
                await EmailService.send({
                    to: user.email,
                    subject: "Password Changed",
                    template: "password-changed",
                    data: {
                        timestamp: new Date(),
                    },
                });
            };

            return { success: true };
        } catch (error: any) {
            logWithContext("error", "[PasswordReset] Reset failed", {
                error: error.message,
            });
            throw error;
        }
    }

    //Reset password with OTP code (for SMS method)
    static async resetPasswordWithCode(input: {
        phoneNumber: string;
        code: string;
        newPassword: string;
    }) {
        try {
            const user = await prisma.user.findFirst({
                where: {
                  phoneNumber: input.phoneNumber,
                  resetTokenExpiry: { gt: new Date() },
                },
            });
        
            if (!user) {
                throw new Error("INVALID_OR_EXPIRED_CODE");
            };
        
            // Verify code
            const valid = await bcrypt.compare(input.code, user.resetToken!);
        
            if (!valid) {
                throw new Error("INVALID_CODE");
            };

            // Hash new password
            const hashedPassword = await bcrypt.hash(input.newPassword, 12);

            // Update password
            await prisma.user.update({
                where: { uuid: user.uuid },
                data: {
                    password: hashedPassword,
                    resetToken: null,
                    resetTokenExpiry: null,
                    tokenVersion: { increment: 1 },
                    passwordChangedAt: new Date(),
                },
            });

            // Revoke all sessions
            await this.revokeAllSessions(user.uuid);

            logWithContext("info", "[PasswordReset] Password reset with code", {
                userUuid: user.uuid,
            });

            return { success: true };
        } catch (error: any) {
            logWithContext("error", "[PasswordReset] Reset with code failed", {
                error: error.message,
            });
            throw error;
        }
    }

    private static async revokeAllSessions(userUuid: string) {
        await prisma.refreshToken.updateMany({
            where: { userUuid },
            data: {
                status: "REVOKED",
                revoked: true,
                revokedAt: new Date(),
                revokedBy: "SYSTEM",
                revokedReason: "PASSWORD_CHANGED",
            },
        });
    
        await prisma.session.updateMany({
            where: { userUuid },
            data: {
                status: "REVOKED",
                revoked: true,
                revokedAt: new Date(),
                revokedBy: "SYSTEM",
                revokedReason: "Password changed",
            },
        });
    }
}
