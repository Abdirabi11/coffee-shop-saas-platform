import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";


// Attribution feeds commission (orders takenBy) and staff stats, so it is
// tenant-scoped, names only active staff at the order's own store, and
// nobody takes credit someone else already holds (supervisors reassign via
// attributeOrder).
async function findOrder(tenantUuid: string, orderUuid: string) {
    const order = await prisma.order.findFirst({
        where: { uuid: orderUuid, tenantUuid },
        select: { uuid: true, storeUuid: true, takenBy: true, servedBy: true, preparedBy: true },
    });
    if (!order) throw new Error("ORDER_NOT_FOUND");
    return order;
}

async function assertStaffAtStore(tenantUuid: string, storeUuid: string, userUuids: string[]) {
    const unique = [...new Set(userUuids)];
    if (unique.some((u) => typeof u !== "string" || !u)) throw new Error("VALIDATION_ERROR");
    const staff = await prisma.userStore.count({
        where: { tenantUuid, storeUuid, userUuid: { in: unique }, isActive: true },
    });
    if (staff !== unique.length) throw new Error("NOT_STAFF_AT_STORE");
}

export class OrderAttributionService{
    static async attributeOrder(input: {
        tenantUuid: string;
        orderUuid: string;
        takenBy?: string;
        preparedBy?: string[];
        servedBy?: string;
    }) {
        const existing = await findOrder(input.tenantUuid, input.orderUuid);
        if (input.preparedBy !== undefined && !Array.isArray(input.preparedBy)) throw new Error("VALIDATION_ERROR");
        const named = [input.takenBy, ...(input.preparedBy ?? []), input.servedBy].filter((u) => u !== undefined) as string[];
        await assertStaffAtStore(input.tenantUuid, existing.storeUuid, named);

        // Only the fields given change
        const order = await prisma.order.update({
            where: { uuid: input.orderUuid },
            data: {
                takenBy: input.takenBy,
                preparedBy: input.preparedBy ? [...new Set(input.preparedBy)] : undefined,
                servedBy: input.servedBy,
            },
        });

        logWithContext("info", "[OrderAttribution] Order attributed", {
            orderUuid: input.orderUuid,
            takenBy: input.takenBy,
            preparedBy: input.preparedBy,
            servedBy: input.servedBy,
        })

        MetricsService.increment("Order.attributed", 1)

        return order;
    }

    //Set order as taken by current user (unless someone else already took it)
    static async setTakenBy(input: {
        tenantUuid: string;
        orderUuid: string;
        userUuid: string;
    }) {
        const existing = await findOrder(input.tenantUuid, input.orderUuid);
        await assertStaffAtStore(input.tenantUuid, existing.storeUuid, [input.userUuid]);

        const { count } = await prisma.order.updateMany({
            where: {
                uuid: input.orderUuid,
                tenantUuid: input.tenantUuid,
                OR: [{ takenBy: null }, { takenBy: input.userUuid }],
            },
            data: { takenBy: input.userUuid },
        });
        if (count === 0) throw new Error("ALREADY_ATTRIBUTED");

        return prisma.order.findUniqueOrThrow({ where: { uuid: input.orderUuid } });
    }

    //Add staff to prepared by list
    static async addPreparedBy(input: {
        tenantUuid: string;
        orderUuid: string;
        userUuid: string;
    }) {
        const order = await findOrder(input.tenantUuid, input.orderUuid);
        await assertStaffAtStore(input.tenantUuid, order.storeUuid, [input.userUuid]);

        if (order.preparedBy.includes(input.userUuid)) {
            return prisma.order.findUniqueOrThrow({ where: { uuid: input.orderUuid } });
        }

        return prisma.order.update({
            where: { uuid: input.orderUuid },
            data: { preparedBy: { push: input.userUuid } },
        });
    }

    //Set order as served by current user (unless someone else already served it)
    static async setServedBy(input: {
        tenantUuid: string;
        orderUuid: string;
        userUuid: string;
    }) {
        const existing = await findOrder(input.tenantUuid, input.orderUuid);
        await assertStaffAtStore(input.tenantUuid, existing.storeUuid, [input.userUuid]);

        const { count } = await prisma.order.updateMany({
            where: {
                uuid: input.orderUuid,
                tenantUuid: input.tenantUuid,
                OR: [{ servedBy: null }, { servedBy: input.userUuid }],
            },
            data: { servedBy: input.userUuid },
        });
        if (count === 0) throw new Error("ALREADY_ATTRIBUTED");

        return prisma.order.findUniqueOrThrow({ where: { uuid: input.orderUuid } });
    }

    //Get staff order statistics
    static async getStaffOrderStats(input: {
        userUuid: string;
        storeUuid: string;
        dateFrom?: Date;
        dateTo?: Date;
    }) {
        const where: any = {
            storeUuid: input.storeUuid,
            status: "COMPLETED",
        };

        if (input.dateFrom || input.dateTo) {
            where.createdAt = {};
            if (input.dateFrom) where.createdAt.gte = input.dateFrom;
            if (input.dateTo) where.createdAt.lte = input.dateTo;
        }

        // Orders taken
        const ordersTaken = await prisma.order.findMany({
            where: {
                ...where,
                takenBy: input.userUuid,
            },
        });

        // Orders served
        const ordersServed = await prisma.order.findMany({
            where: {
                ...where,
                servedBy: input.userUuid,
            },
        });

        // Orders prepared (involved in)
        const ordersPrepared = await prisma.order.findMany({
            where: {
                ...where,
                preparedBy: { has: input.userUuid },
            },
        });

        const totalRevenue = ordersTaken.reduce((sum, o) => sum + o.totalAmount, 0);
        const totalTips = ordersTaken.reduce((sum, o) => sum + (o.tipAmount || 0), 0);
        const avgOrderValue = ordersTaken.length > 0 ? Math.round(totalRevenue / ordersTaken.length) : 0;

        return {
            ordersTaken: {
                count: ordersTaken.length,
                totalRevenue,
                totalTips,
                avgOrderValue,
            },
            ordersServed: {
                count: ordersServed.length,
            },
            ordersPrepared: {
                count: ordersPrepared.length,
            },
        };
    }

    //Get top performers by orders
    static async getTopPerformers(input: {
        storeUuid: string;
        dateFrom: Date;
        dateTo: Date;
        limit?: number;
    }) {
        const orders = await prisma.order.findMany({
            where: {
                storeUuid: input.storeUuid,
                status: "COMPLETED",
                takenBy: { not: null },
                createdAt: {
                    gte: input.dateFrom,
                    lte: input.dateTo,
                },
            },
            include: {
                takenByUser: {
                    select: {
                        uuid: true,
                        firstName: true,
                        lastName: true,
                        profilePhoto: true,
                    },
                },
            },
        });

        // Group by staff
        const staffStats = new Map<string, any>();

        for (const order of orders) {
            if (!order.takenBy) continue;

            if (!staffStats.has(order.takenBy)) {
                staffStats.set(order.takenBy, {
                    userUuid: order.takenBy,
                    user: order.takenByUser,
                    orderCount: 0,
                    totalRevenue: 0,
                    totalTips: 0,
                });
            }

            const stats = staffStats.get(order.takenBy)!;
            stats.orderCount++;
            stats.totalRevenue += order.totalAmount;
            stats.totalTips += order.tipAmount || 0;
        }

        // Convert to array and sort
        const performers = Array.from(staffStats.values())
            .sort((a, b) => b.totalRevenue - a.totalRevenue)
            .slice(0, input.limit || 10)
            .map((p, index) => ({
                rank: index + 1,
                ...p,
                avgOrderValue: p.orderCount > 0 ? Math.round(p.totalRevenue / p.orderCount) : 0,
            }));

        return performers;
    }
}