import { SubscriptionStatus, TenantStatus } from "@prisma/client";
import type { Request, Response } from "express"
import prisma from "../../config/prisma.ts"

export const overrideSubscription= async (req: Request, res: Response)=>{
    const {tenantUuid}= req.params;
    const [
        status,
        planName,
        price,
        endDate
    ]= req.body;
    try {
        const subscription= await prisma.subscription.findUnique({
            where: {tenantUuid},
        });
        if(!subscription){
            return res.status(404).json({success: false, message: "Subscription not found"})
        };

        const updated= await prisma.$transaction(async (tx:any)=> {
            const sub= await tx.subscription.update({
                where: {tenantUuid},
                data: {
                    status,
                    planName,
                    price,
                    endDate: endDate ? new Date() : undefined
                }
            })

            if(status === SubscriptionStatus.ACTIVE){
                await tx.tenant.update({
                    where: {uuid: tenantUuid},
                    data: {status: TenantStatus.ACTIVE}
                })
            };

            if( status === SubscriptionStatus.CANCELED ||
                status === SubscriptionStatus.PAST_DUE
            ){
                await tx.tenant.update({
                    where: {uuid: tenantUuid},
                    data: {status: TenantStatus.SUSPENDED}
                })
            }

            await tx.auditLog.create({
                data: {
                    actorUuid: req.user!.userUuid,
                    action: "SUBSCRIPTION_OVERRIDE",
                    target: tenantUuid,
                    ipAddress: req.ip ?? "UNKNOWN",
                    storeUuid: tenantUuid,
                }
            });

            return sub;
        });

        return res.json({
            message: "Subscription overridden successfully",
            subscription: updated,
        });
    } catch (err) {
        console.error("Override subscription error:", err);
        return res.status(500).json({ message: "Failed to override subscription" });
    }
}

export const getSubs= async(req:Request, res:Response)=>{

};

export const getSingleSubs= async(req:Request, res:Response)=>{

};

export const updateSubs= async(req:Request, res:Response)=>{

};

export const cancelSubs= async(req:Request, res:Response)=>{

};