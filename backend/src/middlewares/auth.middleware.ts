import type { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma.ts"
import { verifyAccessToken } from "../utils/jwt.ts";

export interface AuthRequest extends Request {
    user?: {
      userUuid: string;
      role: string;
      tenantUuid?: string;
      storeUuid?: string;
      tokenVersion: number;
    };
};

export const authenticate= async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
)=>{
    try {
        const authHeader= req.headers.authorization;
        console.log("AUTH HEADER:", req.headers.authorization);
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ message: "Unauthorized" });
        };

        const token= authHeader.split(" ")[1];
        const payload = verifyAccessToken(token);

        const user= await prisma.user.findUnique({
            where: { uuid: payload.userUuid },
            select: { tokenVersion: true, banned: true },
        });
        if (!user || user.banned) {
            return res.status(401).json({ message: "Account blocked" });
        };

        if (payload.tokenVersion !== user.tokenVersion) {
            return res.status(401).json({ message: "Token revoked" });
        };
        
        req.user = payload;
        next()
    } catch (err: any) {
        return res.status(401).json({ message: "Invalid or expired token" });
    } 
};

export const authorize =
  (...allowedRoles: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
};

export const requireStoreContext = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user?.storeUuid) {
      return res.status(400).json({ message: "Store context required" });
    }
    next();
};

export const require2FA= async(req: AuthRequest, res: Response, next: NextFunction)=>{
    const record= await prisma.admin2FA.findUnique({
        where: { userUuid: req.user!.userUuid },
    });

    if (!req.user) {
        return res.status(401).json({ message: "Unauthenticated" });
    }

    if (!record?.enabled) {
        return res.status(403).json({ message: "2FA required" });
    };
    
    next();
};

export const requireStoreAccess =
  (storeParam = "storeUuid") =>
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const storeUuid = req.params[storeParam];

    const access = await prisma.storeStaff.findFirst({
      where: {
        userUuid: req.user!.userUuid,
        storeUuid,
      },
    });

    if (!access) {
      return res.status(403).json({ message: "Store access denied" });
    }

    next();
};

export const enforceStoreLimit = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const tenantUuid= req.user!.tenantUuid;

    const tenant= await prisma.tenant.findUnique({
        where: {uuid: tenantUuid},
        include: {
            stores: true,
            subscription: { include: { plan: true } },
        }
    });

    if (!tenant?.subscription?.plan) {
        return res.status(403).json({ message: "No active subscription" });
    };

    if (tenant.stores.length >= tenant.subscription.plan.maxStores) {
        return res.status(403).json({ message: "Store limit reached" });
    };

    next();
};
