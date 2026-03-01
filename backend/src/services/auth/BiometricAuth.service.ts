import crypto from "crypto";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { signAccessToken, signRefreshToken } from "../../utils/jwt.ts";
import { SessionService } from "./Session.service.ts";

export class BiometricAuthService{
    //Enable biometric auth for device
    static async enableBiometric(input: {
        userUuid: string;
        deviceId: string;
        deviceFingerprint: string;
        publicKey: string; // Client's public key for encryption
        biometricType: "FINGERPRINT" | "FACE_ID" | "IRIS";
    }) {
        try {
            // Generate secure token for this device
            const biometricToken = crypto.randomBytes(32).toString("hex");
            const hashedToken = crypto
                .createHash("sha256")
                .update(biometricToken)
                .digest("hex");

            // Store in database
            await prisma.biometricAuth.create({
                data: {
                    userUuid: input.userUuid,
                    deviceId: input.deviceId,
                    deviceFingerprint: input.deviceFingerprint,
                    biometricType: input.biometricType,
                    tokenHash: hashedToken,
                    publicKey: input.publicKey,
                    enabled: true,
                    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
                },
            });

            logWithContext("info", "[BiometricAuth] Enabled", {
                userUuid: input.userUuid,
                deviceId: input.deviceId,
                biometricType: input.biometricType,
            });

            // Return encrypted token to client (encrypt with client's public key)
            return {
                biometricToken, // Client stores this securely in keychain
                expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            };
        } catch (error: any) {
            logWithContext("error", "[BiometricAuth] Failed to enable", {
                error: error.message,
            });
            throw error;
        }
    }

    //Authenticate with biometric token
    static async authenticateWithBiometric(input: {
        deviceId: string;
        biometricToken: string;
        req: any;
    }) {
        try {
            const hashedToken = crypto
                .createHash("sha256")
                .update(input.biometricToken)
                .digest("hex");

            // Find biometric auth record
            const biometricAuth = await prisma.biometricAuth.findFirst({
                where: {
                    deviceId: input.deviceId,
                    tokenHash: hashedToken,
                    enabled: true,
                    expiresAt: { gt: new Date() },
                },
                include: {
                    user: true,
                },
            });

            if (!biometricAuth) {
                throw new Error("INVALID_BIOMETRIC_TOKEN");
            };
        
            // Check if user is banned
            if (biometricAuth.user.isBanned || biometricAuth.user.isGloballyBanned) {
                throw new Error("ACCOUNT_BANNED");
            };
        
            // Update last used
            await prisma.biometricAuth.update({
                where: { uuid: biometricAuth.uuid },
                data: { lastUsedAt: new Date() },
            });

            // Generate tokens
            const accessToken = signAccessToken({
                userUuid: biometricAuth.userUuid,
                role: biometricAuth.user.globalRole,
                tokenVersion: biometricAuth.user.tokenVersion,
            });

            const refreshToken = signRefreshToken({
                userUuid: biometricAuth.userUuid,
                tokenVersion: biometricAuth.user.tokenVersion,
            });

            // Store refresh token
            const storedToken = await prisma.refreshToken.create({
                data: {
                    token: refreshToken,
                    userUuid: biometricAuth.userUuid,
                    deviceFingerprint: biometricAuth.deviceFingerprint,
                    deviceId: input.deviceId,
                    issuedFrom: input.req.ip!,
                    userAgent: input.req.headers["user-agent"],
                    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                },
            });

            // Create session
            await SessionService.createUserSession(
                biometricAuth.userUuid,
                storedToken.uuid,
                input.req
            );

            logWithContext("info", "[BiometricAuth] Login successful", {
                userUuid: biometricAuth.userUuid,
                deviceId: input.deviceId,
            });

            return {
                user: biometricAuth.user,
                accessToken,
                refreshToken,
            };
        } catch (error: any) {
            logWithContext("error", "[BiometricAuth] Authentication failed", {
                error: error.message,
            });
            throw error;
        }
    }

    //Disable biometric auth
    static async disableBiometric(input: {
        userUuid: string;
        deviceId: string;
    }) {
        await prisma.biometricAuth.updateMany({
            where: {
                userUuid: input.userUuid,
                deviceId: input.deviceId,
            },
            data: {
                enabled: false,
                disabledAt: new Date(),
            },
        });
      
        logWithContext("info", "[BiometricAuth] Disabled", {
            userUuid: input.userUuid,
            deviceId: input.deviceId,
        });
    }
}