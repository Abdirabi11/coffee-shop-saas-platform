import type { Request, Response } from "express"
import type { AuthRequest } from "../middlewares/auth.middleware.ts";
import { listSessions, logoutByRefreshToken, revokeAllSessions } from "../services/session.service.ts";
import { 
    verifySignupService, 
    requestSignupOtpService,
    completeProfileService, 
    getMeService, 
    requestLoginOtpService, 
    resendLoginOtpService, 
    selectStoreService, 
    verifyLoginOtpService 
} from "../services/auth.service.ts";
import { rotateRefreshTokenService } from "../services/token.service.ts";


export const requestSignupOtp = async (req: Request, res: Response) => {
    try {
      const { phoneNumber } = req.body;
  
      await requestSignupOtpService(phoneNumber);
  
      res.status(200).json({ message: "OTP sent" });
    } catch (err: any) {
      if (err.message === "Phone number already registered") {
        return res.status(400).json({ message: err.message });
      }
  
      console.error("requestSignupOtp error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
};

export const verifySignup = async (req: AuthRequest, res: Response) => {
    try {
      const result = await verifySignupService(req, req.body);
  
      res.status(201).json({
        success: true,
        message: "Signup completed",
        user: {
          uuid: result.verifiedUser.uuid,
          name: result.verifiedUser.name,
          email: result.verifiedUser.email,
          role: result.verifiedUser.role,
        },
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
};

export const requestLoginOtp = async (req: Request, res: Response) => {
    try {
      const { phoneNumber } = req.body;
  
      const attempt = await requestLoginOtpService(phoneNumber);
  
      res.cookie("login_attempt", attempt.uuid, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 5 * 60 * 1000,
      });
  
      res.status(200).json({ message: "OTP sent" });
    } catch (err: any) {
      if (
        err.message === "phoneNumber is required" ||
        err.message === "User not found"
      ) {
        return res.status(400).json({ message: err.message });
      }
  
      console.error("requestLoginOtp error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
};

export const verifyLoginOtp = async (req: AuthRequest, res: Response) => {
    try {
      const { code } = req.body;
      const attemptUuid = req.cookies.login_attempt;
  
      if (!code || !attemptUuid) {
        return res.status(400).json({ message: "Invalid request" });
      }
  
      const { user, accessToken, refreshToken } =
        await verifyLoginOtpService(code, attemptUuid, req);
  
      res.clearCookie("login_attempt");
  
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
    } catch (err: any) {
      const statusMap: Record<string, number> = {
        "Invalid request": 400,
        "Invalid OTP": 400,
        "Invalid code": 400,
        "OTP expired": 400,
        "Too many attempts": 429,
        "Account blocked": 403,
      };
  
      const status = statusMap[err.message] ?? 500;
      res.status(status).json({ message: err.message || "Internal server error" });
    }
};

export const logout = async (req: Request, res: Response) => {
    try {
      const refreshToken = req.cookies.refreshToken;
      if (!refreshToken) return res.sendStatus(204);
  
      await logoutByRefreshToken(refreshToken);
  
      res.clearCookie("accessToken");
      res.clearCookie("refreshToken");
  
      res.status(200).json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (err) {
      console.error("logout error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
};

export const logoutAll = async (req: AuthRequest, res: Response) => {
    try {
      const { userUuid, storeUuid } = req.user!;
  
      await revokeAllSessions(userUuid, storeUuid);
  
      res.clearCookie("refreshToken");
  
      res.status(200).json({
        success: true,
        message: "Logged out from all devices",
      });
    } catch (err) {
      console.error("logoutAll error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
};

export const refreshToken = async (req: Request, res: Response) => {
    try {
      const token = req.cookies.refreshToken;
      if (!token) {
        return res.status(401).json({ message: "No refresh token" });
      }
  
      const { newAccessToken, newRefreshToken } =
        await rotateRefreshTokenService(token, req);
  
      res.cookie("refreshToken", newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
  
      res.status(200).json({ accessToken: newAccessToken });
    } catch (err) {
      console.error("refreshToken error:", err);
      res.status(401).json({ message: "Invalid or expired refresh token" });
    }
};

export const getMe = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
  
      const user = await getMeService(
        req.user.userUuid,
        req.user.storeUuid
      );
  
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
  
      res.status(200).json({ success: true, user });
    } catch (err) {
      console.error("getMe error:", err);
      res.status(500).json({ message: "Server error" });
    }
};

export const resendOtp = async (req: AuthRequest, res: Response) => {
    try {
      const { phoneNumber } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({ message: "phoneNumber is required" });
      }
  
      await resendLoginOtpService(phoneNumber);
  
      res.status(200).json({
        success: true,
        message: "OTP resent successfully",
      });
    } catch (err: any) {
      if (err.message === "User not found") {
        return res.status(404).json({ message: err.message });
      }
  
      console.error("resendOtp error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
};

export const getSessions = async (req: AuthRequest, res: Response) => {
    try {
      const { userUuid, storeUuid } = req.user!;
      const currentRefreshToken = req.cookies.refreshToken;
  
      const sessions = await listSessions(userUuid, storeUuid);
  
      const formatted = sessions.map((session: any) => ({
        uuid: session.uuid,
        deviceType: session.deviceType,
        deviceId: session.deviceId,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        lastUsedAt: session.lastUsedAt,
        createdAt: session.createdAt,
        isCurrent: session.refreshToken.token === currentRefreshToken,
      }));
  
      res.status(200).json({ success: true, sessions: formatted });
    } catch (err) {
      console.error("getSessions error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
};

export const completeProfile = async (req: AuthRequest, res: Response) => {
    try {
      const { userUuid } = req.user!;
      const { name, email } = req.body;
  
      const user = await completeProfileService(userUuid, name, email);
  
      res.status(200).json({ success: true, user });
    } catch (err: any) {
      if (err.message === "Email already in use") {
        return res.status(409).json({ message: err.message });
      }
  
      console.error("completeProfile error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
};

export const selectStore = async (req: AuthRequest, res: Response) => {
    try {
      const { storeUuid } = req.body;
  
      const accessToken = await selectStoreService(
        req.user!.userUuid,
        storeUuid,
        req.user!.role
      );
  
      res.json({ accessToken });
    } catch (err: any) {
      if (err.message === "Not a member of this store") {
        return res.status(403).json({ message: err.message });
      }
  
      console.error("selectStore error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
};