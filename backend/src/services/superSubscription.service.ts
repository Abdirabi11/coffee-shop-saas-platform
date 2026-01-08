import prisma from "../config/prisma.ts"
import { SubscriptionStatus, TenantStatus } from "@prisma/client";
import { auditLogService } from "./auditLog.service.ts"
import { invalidateCache } from "../utils/cache.ts";
import { invalidateAdminDashboards, invalidateTenantCaches } from "../cache/cache.js";


export class SuperAdminSubscriptionService {

    static async subscriptionTenant({
        tenantUuid,
        planUuid,
        actorUuid,
        ipAddress,
    }: {
        tenantUuid: string;
        planUuid: string;
        actorUuid: string;
        ipAddress?: string;
    }) {
        const variant= await prisma.planPricingVariant.findFirst({
            where: {
                planUuid,
                isActive: true
            },
            orderBy: { createdAt: "desc" },
        });
        if (!variant) {
            throw new Error("No active pricing variant found");
        };

        const subscription = prisma.$transaction(async (tx)=>{
            const sub= await tx.subscription.upsert({
                where: {tenantUuid},
                update:{
                    planUuid,
                    pricingVariantUuid: variant.uuid,
                    priceMonthly: variant.priceMonthly,
                    status: SubscriptionStatus.ACTIVE,
                    startedAt: new Date(),
                } ,
                create: {
                    tenantUuid,
                    planUuid,
                    pricingVariantUuid: variant.uuid,
                    priceMonthly: variant.priceMonthly,
                    status: SubscriptionStatus.ACTIVE,
                    startedAt: new Date(),
                }
            });

            await tx.tenant.update({
                where: {uuid: tenantUuid},
                data: {status: TenantStatus.ACTIVE}
            });

            await auditLogService.log(tx, {
                actorUuid,
                action: "SUBSCRIPTION_FORCE_SUBSCRIBE",
                target: tenantUuid,
                ipAddress,
                storeUuid: tenantUuid,
            });
            return sub;
        });
        await invalidateAdminDashboards();
        await invalidateTenantCaches(tenantUuid);
    
        return subscription; 
    }

    static async overrideSubscription({
        tenantUuid,
        status,
        planName,
        price,
        endDate,
        actorUuid,
        ipAddress,
    }: {
        tenantUuid: string;
        status: SubscriptionStatus;
        planName?: string;
        price?: number;
        endDate?: Date;
        actorUuid: string;
        ipAddress?: string;
    }) {
        const updated= prisma.$transaction(async (tx) => {
            const subscription= await tx.subscription.findUnique({
                where: {tenantUuid}
            });
            if (!subscription) {
                throw new Error("Subscription not found");
            };

            const sub= await prisma.subscription.update({
                where: {tenantUuid},
                data: {
                    status,
                    planName,
                    priceMonthly: price,
                    endDate,
                },
            });

            if (status === SubscriptionStatus.ACTIVE) {
                await tx.tenant.update({
                  where: { uuid: tenantUuid },
                  data: { status: TenantStatus.ACTIVE },
                });
            };

            if(status === SubscriptionStatus.CANCELED || status === SubscriptionStatus.PAST_DUE){
                await tx.tenant.update({
                    where: {uuid: tenantUuid},
                    data: {status: TenantStatus.SUSPENDED}
                })
            };

            await auditLogService.log(tx, {
                actorUuid,
                action: "SUBSCRIPTION_OVERRIDE",
                target: tenantUuid,
                ipAddress,
                storeUuid: tenantUuid,
            });

            return sub;
        });
        await invalidateAdminDashboards();
        await invalidateTenantCaches(tenantUuid);
          
        return updated;
    }

    static async cancelSubscription ({
        tenantUuid,
        actorUuid,
        ipAddress,
    }: {
        tenantUuid: string;
        actorUuid: string;
        ipAddress?: string;
    }) {
        return this.overrideSubscription({
            tenantUuid,
            status: SubscriptionStatus.CANCELED,
            actorUuid,
            ipAddress,
        });
    }

    static async getSubscriptions(){
        return prisma.subscription.findMany({
            include: {
                tenant: true,
                plan: true,
            },
            orderBy: { createdAt: "desc" },
        });
    }

    static async getSingleSubscription(tenantUuid: string){
        return prisma.subscription.findUnique({
            where: { tenantUuid },
            include: {
              tenant: true,
              plan: true,
              invoices: true,
            },
        });
    }
};