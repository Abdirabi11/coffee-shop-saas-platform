import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";

export class OTPCleanupJob{
    //Clean up expired OTP records
    //Run every 30 minutes
    static async run(){
        const startTime = Date.now();
    
        logWithContext("info", "[OTPCleanup] Starting cleanup");

        try {
            const now = new Date();

            // Clean up expired login attempts (older than 24 hours)
            const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const deletedLoginAttempts = await prisma.loginAttempt.deleteMany({
                where: {
                    OR: [
                        { expiresAt: { lt: now } },
                        { used: true, usedAt: { lt: cutoff } },
                    ],
                },
            });

            // Clean up expired OTP codes from users
            const clearedUserOTPs = await prisma.user.updateMany({
                where: {
                otpExpiresAt: { lt: now },
                otpCode: { not: null },
                },
                data: {
                    otpCode: null,
                    otpExpiresAt: null,
                    otpAttempts: 0,
                },
            });

            // Reset failed login attempts for locked accounts (after 24 hours)
            const unlockCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
            
            const unlockedAccounts = await prisma.user.updateMany({
                where: {
                    lockedUntil: { lt: now, not: null },
                },
                data: {
                    lockedUntil: null,
                    failedLoginAttempts: 0,
                },
            });

            const duration = Date.now() - startTime;

            logWithContext("info", "[OTPCleanup] Cleanup completed", {
                deletedLoginAttempts: deletedLoginAttempts.count,
                clearedUserOTPs: clearedUserOTPs.count,
                unlockedAccounts: unlockedAccounts.count,
                durationMs: duration,
            });

            MetricsService.increment("otp.cleanup.login_attempts", deletedLoginAttempts.count);
            MetricsService.increment("otp.cleanup.user_otps", clearedUserOTPs.count);
            MetricsService.increment("account.unlocked", unlockedAccounts.count);
            MetricsService.timing("otp.cleanup.duration", duration);

            return {
                deletedLoginAttempts: deletedLoginAttempts.count,
                clearedUserOTPs: clearedUserOTPs.count,
                unlockedAccounts: unlockedAccounts.count,
            };

        } catch (error: any) {
            logWithContext("error", "[OTPCleanup] Cleanup failed", {
                error: error.message,
            });

            MetricsService.increment("otp.cleanup.error", 1);

            throw error;
        }
    }
}