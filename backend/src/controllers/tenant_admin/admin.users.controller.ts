import type { Request, Response } from "express"
import { logAudit } from "../utils/audit.ts";
import prisma from "../config/prisma.ts"
import { dispatchWebhook } from "../services/webhook.service.ts";


export const  createAdmin=async(req: Request, res: Response)=>{
    try {
        const {phoneNumber}= req.body
        const storeUuid = req.user!.storeUuid;

        const admin= await prisma.user.create({
            data: {
                phoneNumber,
                role: "ADMIN",
                isVerified: false,
                userStores: {
                    create: { storeUuid },
                },
            },
        });

        await logAudit({
            actorUuid: req.user!.userUuid,
            storeUuid,
            action: "CREATE_ADMIN",
            targetType: "USER",
            targetUuid: admin.userUuid,
            req,
        });
        return res.status(201).json({ success: true, admin });
    } catch (err) {
        console.error("Error in create admin:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const adminCreateUser= async(req: Request, res: Response)=>{
    try {
        const { phoneNumber, role } = req.body;
        const storeUuid = req.user!.storeUuid;

        const user= await prisma.user.create({
            where: {
                phoneNumber,
                role,
                isVerified: false,
                userStores: {
                    create: { storeUuid },
                },
            }
        });

        await logAudit({
            actorUuid: req.user!.userUuid,
            storeUuid,
            action: "CREATE_USER",
            targetType: "USER",
            targetUuid: user.uuid,
            req,
        });
        return res.status(201).json({ success: true, user });
    } catch (err) {
        console.error("Error in admin create user :", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const changeUserRole= async(req: Request, res: Response)=>{
    try {
        const { userUuid, role } = req.body;
        const storeUuid = req.user!.storeUuid;

        await prisma.user.update({
          where: { uuid: userUuid, storeUuid },
          data: { role },
        });

        const exists= await prisma.userStore.findFirst({
            where : {userUuid, storeUuid}
        });

        if (!exists) {
            return res.status(403).json({ message: "Cross-store access denied" });
        };
        
        await prisma.user.update({
            where: { uuid: userUuid },
            data: { role },
        });

        await logAudit({
            actorUuid: req.user!.userUuid,
            storeUuid,
            action: "CHANGE_ROLE",
            targetType: "USER",
            targetUuid: userUuid,
            req,
        });
    
        return res.json({ success: true });
    } catch (err) {
        console.error("Error in change user role:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const banUsers= async(req: Request, res: Response)=>{
    try {
        const { userUuid } = req.body;
        const storeUuid= req.user!.storeUuid;

        await prisma.$transactions([
            prisma.user.update({
                where: {
                    userUuid_storeUuid: {
                        userUuid,
                        storeUuid: req.user!.storeUuid,
                    },
                },
                data: { isVerified: false },
            }),
    
            prisma.session.updateMany({
                where: { 
                    userUuid, 
                    storeUuid: req.user!.storeUuid, 
                },
                data: { revoked: true },
            })
        ]);
        
        await logAudit({
            actorUuid: req.user!.userUuid,
            storeUuid,
            action: "BAN_USER",
            targetType: "USER",
            targetUuid: userUuid,
            req,
        });

        await dispatchWebhook(storeUuid, "SECURITY_ALERT", {
            type: "USER_BANNED",
            storeUuid,
            actor: req.user.userUuid,
            targetUser: userUuid,
        });

        return res.json({ success: true });
    } catch (err) {
        console.error("Error in ban users:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const viewAllUsers= async(req: Request, res: Response)=>{
    const storeUuid = req.user!.storeUuid;

    const users= await prisma.user.findMany({
        where: {
            userStore: {
                some: { storeUuid },
            },
        },
        select: {
            uuid: true,
            phoneNumber: true,
            role: true,
            isVerified: true,
            createdAt: true,
        },
    });

    return res.json({ users });
};

