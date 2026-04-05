import crypto from "crypto";
import { authenticator } from "@otplib/preset-default";
import QRCode from "qrcode";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

export class TwoFactorService {
  
    //Setup 2FA for user
    static async setup(userUuid: string) {
        try {
            const user = await prisma.user.findUnique({
              where: { uuid: userUuid },
              select: { email: true, phoneNumber: true },
            });

            if (!user) {
                throw new Error("USER_NOT_FOUND");
            };
        
            // Generate secret
            const secret = authenticator.generateSecret();
    
            // Generate backup codes (10 codes)
            const backupCodes = Array.from({ length: 10 }, () =>
                crypto.randomBytes(4).toString("hex").toUpperCase()
            );
    
              // Hash backup codes
            const hashedBackupCodes = await Promise.all(
                backupCodes.map((code) => 
                    crypto.createHash("sha256").update(code).digest("hex")
                )
            );

            // Store in database
            await prisma.admin2FA.upsert({
                where: { userUuid },
                update: {
                    secret,
                    backupCodes: hashedBackupCodes,
                    backupCodesUsed: 0,
                    enabled: false,
                    verified: false,
                },
                create: {
                    userUuid,
                    secret,
                    backupCodes: hashedBackupCodes,
                    algorithm: "SHA1",
                    digits: 6,
                    period: 30,
                },
            });

            // Generate QR code
            const otpauth = authenticator.keyuri(
                user.email || user.phoneNumber,
                "Coffee App",
                secret
            );

            const qrCode = await QRCode.toDataURL(otpauth);

            logWithContext("info", "[2FA] Setup initiated", { userUuid });

            if (process.env.NODE_ENV !== "production") {
                const currentCode = authenticator.generate(secret);
                console.log(`\n🔐 [2FA SETUP]`);
                console.log(`   Secret: ${secret}`);
                console.log(`   Current TOTP code: ${currentCode}`);
                console.log(`   (Use within 30 seconds)\n`);
            };    

            return {
                secret,
                qrCode,
                backupCodes, // Show these once, user must save them
            };
        } catch (error: any) {
            logWithContext("error", "[2FA] Setup failed", {
                error: error.message,
                userUuid,
            });
            throw error;
        }
    }

    //Verify 2FA setup
    static async verifySetup(input: {
        userUuid: string;
        token: string;
    }) {
        try {
            const twoFA = await prisma.admin2FA.findUnique({
                where: { userUuid: input.userUuid },
            });
        
            if (!twoFA) {
                throw new Error("2FA_NOT_SETUP");
            }
        
            // Verify token
            const valid = authenticator.verify({
                token: input.token,
                secret: twoFA.secret,
            });

            if (!valid) {
                throw new Error("INVALID_2FA_TOKEN");
            };
        
            // Enable 2FA
            await prisma.admin2FA.update({
                where: { userUuid: input.userUuid },
                data: {
                    enabled: true,
                    verified: true,
                    enabledAt: new Date(),
                },
            });

            logWithContext("info", "[2FA] Verified and enabled", {
                userUuid: input.userUuid,
            });
        
            return { success: true };
        } catch (error: any) {
            logWithContext("error", "[2FA] Verification failed", {
                error: error.message,
            });
            throw error;
        }
    }

    //Verify 2FA token during login
    static async verifyToken(input: {
        userUuid: string;
        token: string;
        isBackupCode?: boolean;
    }) {
        try {
            const twoFA = await prisma.admin2FA.findUnique({
                where: { userUuid: input.userUuid },
            });
        
            if (!twoFA || !twoFA.enabled) {
                throw new Error("2FA_NOT_ENABLED");
            };
        
            let valid = false;
        
            if (input.isBackupCode) {
                // Verify backup code
                const hashedCode = crypto
                    .createHash("sha256")
                    .update(input.token.toUpperCase())
                    .digest("hex");
        
                const backupCodes = twoFA.backupCodes as string[];
                const index = backupCodes.indexOf(hashedCode);
        
                if (index !== -1) {
                    valid = true;
            
                    // Remove used backup code
                    backupCodes.splice(index, 1);
            
                    await prisma.admin2FA.update({
                        where: { userUuid: input.userUuid },
                        data: {
                            backupCodes,
                            backupCodesUsed: { increment: 1 },
                        },
                    });
        
                    logWithContext("warn", "[2FA] Backup code used", {
                        userUuid: input.userUuid,
                        remainingCodes: backupCodes.length,
                    });
                };
            }else {
                // Verify TOTP token
                valid = authenticator.verify({
                    token: input.token,
                    secret: twoFA.secret,
                });
            }

            if (!valid) {
                // Increment failed attempts
                await prisma.admin2FA.update({
                    where: { userUuid: input.userUuid },
                    data: {
                        failedAttempts: { increment: 1 },
                        lastFailedAt: new Date(),
                    },
                });
        
                throw new Error("INVALID_2FA_TOKEN");
            };

            // Update last used
            await prisma.admin2FA.update({
                where: { userUuid: input.userUuid },
                data: {
                    lastUsedAt: new Date(),
                    failedAttempts: 0,
                },
            });

            return { success: true };
        } catch (error: any) {
            logWithContext("error", "[2FA] Token verification failed", {
                error: error.message,
            });
            throw error;
        }
    }

    //Disable 2FA  
    static async disable(input: {
        userUuid: string;
        password: string; // Require password to disable
    }) {
        // ... password verification logic

        await prisma.admin2FA.update({
            where: { userUuid: input.userUuid },
            data: {
                enabled: false,
                disabledAt: new Date(),
            },
        });
    
        logWithContext("warn", "[2FA] Disabled", {
            userUuid: input.userUuid,
        });
    }

    //Check if 2FA is required for user
    static async isRequired(userUuid: string): Promise<boolean> {
        const twoFA = await prisma.admin2FA.findUnique({
            where: { userUuid },
        });

        return !!(twoFA?.enabled && twoFA?.verified);
    }
}