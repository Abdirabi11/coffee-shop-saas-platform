import { SubscriptionStatus, TenantStatus } from "@prisma/client";
import type { Request, Response } from "express"
import prisma from "../../config/prisma.ts"
import { SuperAdminSubscriptionService } from "../../services/subscription.service.ts";


export const subscribe= async (req: Request, res: Response)=>{
    const {tenantUuid, planUuid}= req.body;

    const subscription= await SuperAdminSubscriptionService.subscriptionTenant({
        tenantUuid,
        planUuid,
        actorUuid: req.user!.userUuid,
        ipAddress: req.ip,
    });

    res.json({
        success: true,
        subscription,
    });
};

export const overrideSubscription= async (req: Request, res: Response)=>{
    const {tenantUuid}= req.params;
    const { status, planName, price, endDate } = req.body;

    const subscription= await SuperAdminSubscriptionService.overrideSubscription({
        tenantUuid,
        status,
        planName,
        price,
        endDate: endDate ? new Date(endDate) : undefined,
        actorUuid: req.user!.userUuid,
        ipAddress: req.ip,
    });

    res.json({
        success: true,
        subscription,
    });
};

export const getSubs= async(req:Request, res:Response)=>{
    const subs = await SuperAdminSubscriptionService.getSubscriptions();
    res.json(subs);
};

export const getSingleSubs= async(req:Request, res:Response)=>{
    const sub = await SuperAdminSubscriptionService.getSingleSubscription(req.params.tenantUuid);

    if (!sub) {
        return res.status(404).json({ message: "Subscription not found" });
    };

    res.json(sub);
};

export const cancelSubs= async(req:Request, res:Response)=>{
    const sub = await SuperAdminSubscriptionService.cancelSubscription({
        tenantUuid: req.params.tenantUuid,
        actorUuid: req.user!.userUuid,
        ipAddress: req.ip,
    });

    res.json({
        success: true,
        subscription: sub,
    });
};

function addMonths(arg0: Date, arg1: number) {
    throw new Error("Function not implemented.");
};

