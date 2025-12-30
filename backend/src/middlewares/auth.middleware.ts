import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { canAccess } from "../utils/role.ts";
import prisma from "../config/prisma.ts"
import { verifyAccessToken } from "../utils/jwt.ts";


export interface AuthRequest extends Request {
    user?: {
      userUuid: string;
      role: string;
      storeUuid: string
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

        if (!payload.storeUuid) {
            return res.status(400).json({ message: "Store not selected" });
        };
        
        req.user= {
            userUuid: payload.userUuid,
            role: payload.role,
            storeUuid: payload.storeUuid,
        };

        next()
    } catch (err: any) {
        return res.status(401).json({ message: "Invalid or expired token" });
    } 
};

export const authorize= async (...roles: string[])=>{
    return (req: AuthRequest, res: Response, next: NextFunction)=>{
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: "Forbidden" });
        };

        const allowed = roles.some((role) =>
            canAccess(req.user?.role, role)
        );
        if (!allowed) {
            return res.status(403).json({ message: "Forbidden" });
        };
        
        next();
    }
};

export const require2FA= async(req: AuthRequest, res: Response, next: NextFunction)=>{
    const record= await prisma.admin2FA.findUnique({
        where: { userUuid: req.user!.userUuid },
    });

    if (!record?.enabled) {
        return res.status(403).json({ message: "2FA required" });
    };
    
    next();
};

export const requireStoreAccess= (storeParam = "storeUuid")=>{
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        const storeUuid= req.params[storeParam];

        const access= await prisma.storeStaff.findFirst({
            wherre: {
                userUuid: req.user!.userUuid,
                storeUuid
            }
        });
        if (!access) {
            return res.status(403).json({ message: "Store access denied" });
        };

        next()
    }
}
