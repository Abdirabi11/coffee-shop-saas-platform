import type { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma.ts";


export const enforceStoreLimit = async (req: Request, res: Response, next: NextFunction) => {
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
}