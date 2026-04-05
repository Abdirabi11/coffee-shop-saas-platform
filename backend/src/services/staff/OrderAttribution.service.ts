import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";


export class OrderAttributionService{
    static async attributeOrder(input: {
        orderUuid: string;
        takenBy?: string;
        preparedBy?: string[];
        servedBy?: string;
    }) {
        const order = await prisma.order.update({
            where: { uuid: input.orderUuid },
            data: {
                takenBy: input.takenBy,
                preparedBy: input.preparedBy || [],
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

    //Set order as taken by current user
    static async setTakenBy(input: {
        orderUuid: string;
        userUuid: string;
    }) {
        const order = await prisma.order.update({
            where: { uuid: input.orderUuid },
            data: {
                takenBy: input.userUuid,
                commissionableAmount: undefined, // Will be set when order completes
            },
        });

        return order;
    }

    //Add staff to prepared by list
    static async addPreparedBy(input: {
        orderUuid: string;
        userUuid: string;
    }) {
        const order = await prisma.order.findUnique({
            where: { uuid: input.orderUuid },
        });

        if (!order) {
        throw new Error("ORDER_NOT_FOUND");
        }

        const preparedBy = [...order.preparedBy, input.userUuid];

        return prisma.order.update({
            where: { uuid: input.orderUuid },
            data: { preparedBy },
        });
    }

    //Set order as served by
    static async setServedBy(input: {
        orderUuid: string;
        userUuid: string;
    }) {
        return prisma.order.update({
            where: { uuid: input.orderUuid },
            data: { servedBy: input.userUuid },
        });
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