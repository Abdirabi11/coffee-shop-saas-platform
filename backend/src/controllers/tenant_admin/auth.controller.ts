import type { Request, Response, NextFunction } from "express"
import speakeasy from "speakeasy";
import prisma from "../config/prisma.ts"
import { AuthRequest } from "../middlewares/auth.middleware.ts";
import { signAccessToken, signRefreshToken } from "../utils/jwt.ts";



export const adminLogin= async(req: Request, res: Response)=>{
    try {
        const {phoneNumber, otpCode, deviceId}= req.body;

        const admin = await prisma.user.findUnique({
            where: { phoneNumber },
        });

        if (!admin || !["ADMIN", "SUPER_ADMIN"].includes(admin.role)) {
            return res.status(403).json({ message: "Not an admin account" });
        };

        if(
            admin.otpCode !== otpCode ||
            !admin.otpExpiresAt ||
            admin.otpExpiresAt < new Date()
        ){
            return res.status(401).json({ message: "Invalid OTP" });
        };

        const userStore= await prisma.userStore.findFirst({
            where: { userUuid: admin?.uuid},
            include: { store: true }
        });

        if (!userStore) {
            throw new Error("No store assigned");
        };

        const accessToken = signAccessToken({
            userUuid: admin.uuid,
            role: admin.role,
            storeUuid: userStore.storeUuid,
        });

        const refreshToken = signRefreshToken({
            userUuid: admin.uuid
        });

        const refresh = await prisma.refreshToken.create({
            data: {
              token: refreshToken,
              userUuid: admin.uuid,
            },
        });

        await prisma.session.create({
            data: {
                userUuid: admin.uuid,
                storeUuid: userStore.storeUuid,
                refreshTokenUuid: refresh.uuid,
                deviceId,
                deviceType: req.headers["x-device-type"]?.toString() || "ADMIN_PANEL",
                ipAddress: req.ip,
                userAgent: req.headers["user-agent"] || "UNKNOWN",
            }
        });

        return res
            .cookie("refreshToken", refreshToken, { httpOnly: true })
            .json({ accessToken });
    } catch (err) {
        console.error("Error in admin login:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const generate2FASecret = async (userUuid: string) => {
    const secret = speakeasy.generateSecret({ length: 20 });

    await prisma.admin2FA.upsert({
        where: { userUuid },
        update: { secret: secret.base32 },
        create: { userUuid, secret: secret.base32 },
    });
    return secret.otpauth_url;
};

export const verifyAdmin2FA= async(req: AuthRequest, res: Response)=>{
    const {token}= req.body;

    const record= await prisma.admin2FA.findUnique({
        where: {userUuid: req.user?.userUuid},
    });

    const verified= speakeasy.totp.verfiy({
        secret: record!.secret,
        encoding: "base32",
        token,
        window: 1,
    });
    if (!verified) {
        return res.status(401).json({ message: "Invalid 2FA code" });
    };

    await prisma.admin2FA.update({
        where: { userUuid: req.user!.userUuid },
        data: { enabled: true },
    });
    res.json({ success: true });
};