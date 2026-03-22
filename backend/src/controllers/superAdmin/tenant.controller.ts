import { SubscriptionStatus, TenantStatus } from "@prisma/client";
import type { Request, Response } from "express"
import prisma from "../../config/prisma.ts"
import { invalidateSuperAdminDashboardCache } from "../../utils/cacheInvalidation.ts";


export const suspendTenant= async (req: Request, res: Response)=>{
    const {tenantUuid}= req.params;
    const {reason}= req.body;
    try {
        await prisma.$transaction(async (tx: any)=>{
            const tenant= await tx.tenant.update({
                where: {uuid: tenantUuid},
                data: {status: TenantStatus.SUSPENDED}
            })

            await tx.session.findMany({
                where: {
                    user: {
                        tenantUuid: tenant.uuid
                    }
                },
                data: {
                    revoked: true
                }
            });

            await tx.subscription.updateMany({
                where: {tenantUuid: tenant.uuid},
                data: {status: SubscriptionStatus.PAST_DUE}
            });

            await tx.auditLog.create({
                data: {
                    actorUuid: req.user!.userUuid,
                    action: "TENANT_SUSPENDED",
                    targetType: "TENANT",
                    target: tenant.uuid,
                    ipAddress: req.ip ?? "UNKNOWN",
                    storeUuid: tenant.uuid,
                },
            })
        });

        await invalidateSuperAdminDashboardCache();

        return res.json({
            message: "Tenant suspended successfully",
            tenantUuid,
            reason: reason ?? null,
        });
    } catch (err) {
        console.error("Suspend tenant error:", err);
        return res.status(500).json({ message: "Failed to suspend tenant" });
    }
};

export const activateTenant= async (req: Request, res:Response)=>{
    const {tenantUuid}= req.params;
    try {
        await prisma.tenant.update({
            where: {uuid: tenantUuid},
            data: {status: TenantStatus.ACTIVE}
        });

        res.json({message: "Tenant reactivated successfully"})
    } catch (err) {
        console.error("Activate tenant error:", err);
        return res.status(500).json({ message: "Failed to activate tenant" });
    }
}