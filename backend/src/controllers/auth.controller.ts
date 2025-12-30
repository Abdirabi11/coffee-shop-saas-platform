import type { Request, Response, NextFunction } from "express"
import bcrypt from "bcryptjs";
import prisma from "../config/prisma.ts"
import { verifyRefreshToken, signAccessToken, signRefreshToken } from "../utils/jwt.ts";
import { createSession } from "../security/session.ts";
import type { AuthRequest } from "../middlewares/auth.middleware.ts";
import { evaluateAutoBan } from "../security/fraud.engine.ts";
import { notifyAdmins } from "../utils/adminAlert.ts"


export const hashOtp = async (otp: string) => {
  return bcrypt.hash(otp, 10);
};

export const compareOtp = async (otp: string, hash: string) => {
  return bcrypt.compare(otp, hash);
};

export const requestSignupOtp= async (req: Request, res: Response)=>{
    try {
        const {phoneNumber}= req.body;

        const existingUser = await prisma.user.findUnique({
            where: { phoneNumber },
        });
        if (existingUser?.isVerified) {
            return res.status(400).json({
              message: "Phone number already registered",
            });
        };

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedOtp = await hashOtp(otp);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        if (existingUser){
            await prisma.user.update({
                where: { phoneNumber },
                data: {
                  otpCode: hashedOtp,
                  otpExpiresAt: expiresAt,
                },
            });
        }else{
            await prisma.user.create({
                data: {
                  phoneNumber,
                  otpCode: hashedOtp,
                  otpExpiresAt: expiresAt,
                  role: "CUSTOMER",
                  isVerified: false,
                },
            });
        };

        console.log(`OTP for ${phoneNumber}: ${otp}`);
        res.json({ message: "OTP sent" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Internal server error" });
        console.error("Error in Request signup otp:", err);
    }
};

export const verifySignup= async (req: Request, res: Response)=>{
    try {
        const {phoneNumber, code, name, email}= req.body;

        const user= await prisma.user.findUnique({where: {phoneNumber}});
        if (!user) {
            return res.status(404).json({ message: "OTP not requested" });
        };

        if (user.isVerified) {
            return res.status(400).json({ message: "Phone already registered" });
        };

        if (user.otpAttempts >= 5) {
            return res.status(429).json({ message: "Too many attempts" });
        };

        if (!user.otpExpiresAt || user.otpExpiresAt < new Date()) {
            return res.status(400).json({ message: "Code expired" });
        };

        const isValid = await compareOtp(code, user.otpCode!);
        if (!isValid) {
            const updated= await prisma.user.update({
                where: { phoneNumber },
                data: { otpAttempts: { increment: 1 } },
            });

            if (updated.attempts >= 5) {
                const user = await prisma.user.findUnique({
                  where: { phoneNumber: attempt.phoneNumber },
                  select: { uuid: true },
                });
            
                await prisma.fraudEvent.create({
                  data: {
                    userUuid: user?.uuid,
                    ipAddress: req.ip,
                    reason: "Too many OTP attempts",
                    severity: "HIGH",
                  },
                });
                await evaluateAutoBan(user?.uuid);
                await notifyAdmins({
                    userUuid: user.uuid,
                    reason: "Rapid multi-device login",
                    severity: "MEDIUM",
                    ipAddress: req.ip,
                })
            };
            return res.status(400).json({ message: "Invalid code" });
        };

        const updatedUser= await prisma.user.update({
            where: {phoneNumber},
            data: {
                name,
                email,
                isVerified: true,
                otpCode: null,
                otpExpiresAt: null,
                otpAttempts: 0,
            }
        });

        const accessToken= signAccessToken(
            { userUuid: updatedUser.uuid, role: updatedUser.role }
        );

        const refreshToken= signRefreshToken(
            { userUuid: updatedUser.uuid },
        );

        const storedRefreshToken= await prisma.refreshToken.create({
            data: {token: refreshToken, userUuid: updatedUser.uuid}
        })

        await createSession(updatedUser.uuid, storedRefreshToken.uuid, req);

        res.status(201).json({
            success: true, 
            message: "Signup completed",
            name,
            email,
            accessToken,
            refreshToken
        });
         
    } catch(err){
        console.error("Error in verifySignup:", err);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const requestLoginOtp= async (req: Request, res: Response)=>{
    try {
        const {phoneNumber}= req.body;

        if (!phoneNumber) {
            return res.status(400).json({ message: "phoneNumber is required" });
        };

        const user= await prisma.user.findUnique({ where: { phoneNumber } });
        if (!user || !user.isVerified) {
            return res.status(404).json({ message: "User not found" });
        };
      
        const code= Math.floor(100000 + Math.random() * 900000).toString();

        const attempt = await prisma.loginAttempt.create({
            data: {
              phoneNumber,
              otpCode: await hashOtp(code),
              expiresAt: new Date(Date.now() + 5 * 60 * 1000),
            },
        });

        res.cookie("login_attempt", attempt.uuid, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 5 * 60 * 1000,
        });

        console.log(`Login OTP for ${phoneNumber}: ${code}`);
        res.status(200).json({ message: "OTP sent" });
    } catch (err) {
        console.error("Error in request login otp:", err)
        res.status(500).json({ message: "Internal server error" });
    }
};

export const verifyLoginOtp= async (req: Request, res: Response)=>{
    try {
        const {code}= req.body;
        const attemptUuid= req.cookies.login_attempt;
        if (!code || !attemptUuid) {
            return res.status(400).json({ message: "Invalid request" });
        };

        const attempt= await prisma.LoginAttempt.findUnique({
            where: { uuid: attemptUuid },
        });
        if (!attempt || attempt.used) {
            return res.status(400).json({ message: "Invalid OTP" });
        };

        if (attempt.attempts >= 5) {
            return res.status(429).json({ message: "Too many attempts" });
        }
        
        if (attempt.expiresAt < new Date()) {
        return res.status(400).json({ message: "OTP expired" });
        }

        const isValid= await compareOtp(code, attempt.otpCode!)
        if(!isValid){
            const updated= await prisma.loginAttempt.update({
                where: {uuid: attemptUuid},
                data: { attempts: { increment: 1 }}
            });

            if (updated.attempts >= 5) {
                const user = await prisma.user.findUnique({
                  where: { phoneNumber: attempt.phoneNumber },
                  select: { uuid: true },
                });
            
                await prisma.fraudEvent.create({
                  data: {
                    userUuid: user?.uuid,
                    ipAddress: req.ip,
                    reason: "Too many OTP attempts",
                    severity: "HIGH",
                  },
                });

                await prisma.adminAlert.create({
                    data: {
                      type: "SECURITY",
                      message: `User ${user?.uuid ?? "unknown"} triggered OTP brute-force protection`,
                    },
                });

                await evaluateAutoBan(user?.uuid);
            }
            return res.status(400).json({ message: "Invalid code" });
        }
        
        await prisma.loginAttempt.update({
            where: {uuid: attemptUuid},
            data: { used: true },
        });

        const user = await prisma.user.findUnique({
            where: { phoneNumber: attempt.phoneNumber },
        });

        if(!user || user.banned){
            return res.status(403).json({ message: "Account blocked" });
        }

        const accessToken= signAccessToken({ 
            userUuid: user!.uuid,
            role: user!.role,
        });

        const refreshToken= signRefreshToken(
            {userUuid: user!.uuid, }
        );

        const storedRefreshToken= await prisma.refreshToken.create({
            data: {token: refreshToken, userUuid: user!.uuid}
        });

        await createSession(user.uuid, storedRefreshToken.uuid, req);

        const recentSessions = await prisma.session.count({
            where: {
              userUuid: user.uuid,
              createdAt: {
                gte: new Date(Date.now() - 10 * 60 * 1000)
              },
              revoked: false,
            }
        });

        const distinctFingerprints = await prisma.session.findMany({
            where: {
              userUuid: user.uuid,
              createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
            distinct: ["fingerprintHash"],
            select: { fingerprintHash: true },
        });

        let severity: "LOW" | "MEDIUM" | "HIGH" = "LOW";
        let reason= "";

        if (recentSessions > 3) {
            severity = "MEDIUM";
            reason = "Rapid multi-device login";
        };

        if (distinctFingerprints.length >= 4) {
            severity = "HIGH";
            reason = "Multiple device fingerprints in short time";
        };

        if (severity !== "LOW"){
            await prisma.fraudEvent.create({
                data: {
                    userUuid: user.uuid,
                    ipAddress: req.ip,
                    reason,
                    severity,
                },
            })
        };

        if (severity === "HIGH") {
            await prisma.adminAlert.create({
              data: {
                type: "SECURITY",
                message: `High-risk login behavior detected for user ${user.uuid}`,
              },
            });
    
            await evaluateAutoBan(user.uuid);
        }
        
        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.status(201).json({
            message: "Login successfully",
            accessToken,
            user: {
                uuid: user.uuid,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (err) {
        console.error("Error in Verify login otp:", err)
        res.status(500).json({ message: "Internal server error" });
    }
};

export const logout= async (req: Request, res: Response)=>{
    try {
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) return res.sendStatus(204);

        await prisma.refreshToken.updateMany({
            where: {
                token: refreshToken ,
            },
            data: { revoked: true },
        });

        await prisma.session.updateMany({
            where: {
                refreshToken: { token: refreshToken },
            },
            data: { revoked: true },
        });

        res.clearCookie("accessToken");
        res.clearCookie("refreshToken");
        
        return res.status(201).json({success: true, message: "Logged out successfully"})
    } catch (err: any) {
        console.log("Error in logout controller", err.message);
        res.status(500).json({ success: false, message: "Internal server error" }); 
    }
};

export const refreshToken= async (req: Request, res: Response)=>{
    try {
        const token= req.cookies.refreshToken
        if (!token) return res.status(401).json({ message: "No refresh token" });

        const decoded= verifyRefreshToken(token) as { userUuid: string };

        const storedToken = await prisma.refreshToken.findUnique({
            where: { token },
            include: { user: true },
        });
      
        if (!storedToken || storedToken.revoked) {
            return res.status(401).json({ message: "Invalid refresh token" });
        };

        // Rotate token
        await prisma.refreshToken.update({
            where: { uuid: storedToken.uuid },
            data: { revoked: true },
        });

        await prisma.session.updateMany({
            where: { refreshTokenUuid: storedToken.uuid },
            data: { revoked: true },
        });

        const newAccessToken= signAccessToken({ 
            userUuid: storedToken.user.uuid, 
            role: storedToken.user.role
        });
        const newRefreshToken= signRefreshToken({ 
            userUuid: storedToken.user.uuid, 
        });

        const newStoredRefreshToken= await prisma.refreshToken.create({
            data: {
                token: newRefreshToken,
                userUuid: storedToken.user.uuid,
            }
        });

        await createSession(
            storedToken.user.uuid,
            newStoredRefreshToken.uuid,
            req
        );

        res.cookie("refreshToken", newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
    
        res.status(200).json({ accessToken: newAccessToken });
    } catch (err) {
        console.error(err);
        res.status(401).json({ message: "Invalid or expired refresh token" });
    }
};

export const getMe= async (req: AuthRequest, res: Response)=>{
    try {
        if (!req.user) {
            return res.status(401).json({ message: "Not authenticated" });
        };
      
        const user = await prisma.user.findUnique({
        where: { uuid: req.user!.userUuid },
        include: {
            userStores:{
                where: {storeUuid: req.user!.storeUuid},
                include: {store: true}
            }
        }
        });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        };

        return res.status(200).json({ success: true, user,});
    } catch (err: any) {
        console.error("getMe error:", err);
        return res.status(500).json({ message: "Server error" });
    }
};

export const resendOtp= async (req: AuthRequest, res: Response)=>{
    try {
        const {phoneNumber}= req.body;
        if(!phoneNumber){
            return res.status(400).json({ message: "phoneNumber is required" });
        };
        
        const user= await prisma.user.findUnique({
            where: {phoneNumber}
        });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        };

        await prisma.loginAttempt.updateMany({
            where: {
                phoneNumber,
                used: false
            },
            data: {
                used: true
            }
        });

        const otp= Math.floor(100000 + Math.random() * 900000).toString();

        await prisma.loginAttempt.create({
            data: {
                phoneNumber,
                otpCode: await hashOtp(otp),
                expiresAt: new Date(Date.now() + 5 * 60 * 1000)
            }
        });

        console.log(`Resent OTP for ${phoneNumber}: ${otp}`);
        return res.status(200).json({
          success: true,
          message: "OTP resent successfully",
        });
    } catch (err) {
        console.error("resendOtp error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const logoutAll= async (req: AuthRequest, res: Response)=>{
    try {
        const {userUuid, storeUuid}= req.user?.userUuid;
        if (!userUuid) {
            return res.status(401).json({ message: "Not authenticated" });
        };

        await prisma.refreshToken.updateMany({
            where: {
                userUuid,
                session: {
                    storeUuid
                }
            },
            data: {revoked: true}
        });

        await prisma.session.updateMany({
            where: { 
                userUuid, 
                storeUuid
             },
            data: { revoked: true },
        });

        res.clearCookie("refreshToken");

        return res.status(200).json({
            success: true,
            message: "Logged out from all devices",
        });
    } catch (err) {
        console.error("logoutAll error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const getSessions= async (req: AuthRequest, res: Response)=>{
    try {
        const {userUuid, storeUuid} = req.user!;
        const currentRefreshToken= req.cookies.refreshToken;

        if (!userUuid) {
            return res.status(401).json({ message: "Not authenticated" });
        };

        const sessions= await prisma.session.findMany({
            where: {
                storeUuid,
                userUuid,
                revoked: false
            },
            include: {
                refreshToken: true,
            },
            orderBy: {
                lastUsedAt: "desc",
            },
        });

        const formatted= sessions.map((session: any)=> ({
            uuid: session.uudi,
            deviceType: session.deviceType,
            deviceId: session.deviceId,
            ipAddress: session.ipAddress,
            userAgent: session.userAgent,
            lastUsedAt: session.lastUsedAt,
            createdAt: session.createdAt,
            isCurrent:
                session.refreshToken.token === currentRefreshToken,
        }));
        return res.status(200).json({
            success: true,
            sessions: formatted,
        });
    } catch (err) {
        console.error("getSessions error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const completeProfile= async (req: AuthRequest, res: Response)=>{
    try {
        const {userUuid}= req.user?.userUuid;
        const { name, email } = req.body;
        if (!userUuid) {
          return res.status(401).json({ message: "Not authenticated" });
        };

        if(email){
            const existingEmail= await prisma.user.findUnique({
                where: {email}
            });
            if (existingEmail && existingEmail.uuid !== userUuid) {
                return res.status(409).json({ message: "Email already in use" });
            };
        };

        const updatedUser= await prisma.user.update({
            where: {uuid: userUuid},
            data: {
                name,
                email
            },
            select: {
                uuid: true,
                phoneNumber: true,
                name: true,
                email: true,
                role: true,
            },
        });

        return res.status(200).json({
            success: true,
            user: updatedUser,
        });
    } catch (err: any) {
        console.error("completeProfile error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const selectStore= async (req: Request, res: Response)=>{
    const {storeUuid}= req.body;
    const userUuid= req.user!.userUuid;

    const membership= await prisma.userStore.findFirst({
        where: { userUuid, storeUuid },
    });

    if (!membership) {
        return res.status(403).json({ message: "Not a member of this store" });
    };

    const accessToken= signJwt({
        userUuid,
        role: req.user!.role,
        storeUuid,
    });

    res.json({ accessToken })
};