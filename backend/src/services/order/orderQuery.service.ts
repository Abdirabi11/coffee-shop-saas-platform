import prisma from "../../config/prisma.ts"

export class OrderQueryService{
    static async getByUuid(input: {
        tenantUuid: string;
        orderUuid: string;
        includeHistory?: boolean;
    }){
        const order = await prisma.order.findFirst({
            where: {
                uuid: input.orderUuid,
                tenantUuid: input.tenantUuid,
            },
            include: {
                items: {
                    include: {
                        product: true,
                    },
                },
                payments: true,
                refunds: true,
                statusHistory: input.includeHistory
                    ? {
                        orderBy: { createdAt: "desc" },
                    }
                    : false,
                tenantUser: {
                    include: { user: true },
                },
                store: true,
            },
        });
      
        if (!order) {
            throw new Error("ORDER_NOT_FOUND");
        };
    
        return order;
    }
    //List orders with filters and pagination
    static async list(input: {
        tenantUuid: string;
        storeUuid?: string;
        tenantUserUuid?: string;
        status?: string;
        paymentStatus?: string;
        orderType?: string;
        startDate?: Date;
        endDate?: Date;
        search?: string; // Order number or customer name
        pagination?: {
            page?: number;
            limit?: number;
        };
    }){
        const page = input.pagination?.page || 1;
        const limit = input.pagination?.limit || 20;
        const skip = (page - 1) * limit;

        const where: any = {
            tenantUuid: input.tenantUuid,
        };

        if (input.storeUuid) {
            where.storeUuid = input.storeUuid;
        }

        if (input.tenantUserUuid) {
            where.tenantUserUuid = input.tenantUserUuid;
        }

        if (input.status) {
            where.status = input.status;
        }

        if (input.paymentStatus) {
            where.paymentStatus = input.paymentStatus;
        }

        if (input.orderType) {
            where.orderType = input.orderType;
        }

        if (input.startDate || input.endDate) {
            where.createdAt = {
                ...(input.startDate && { gte: input.startDate }),
                ...(input.endDate && { lte: input.endDate }),
            };
        }

        if (input.search) {
            where.OR = [
                { orderNumber: { contains: input.search, mode: "insensitive" } },
                { customerName: { contains: input.search, mode: "insensitive" } },
                { customerPhone: { contains: input.search } },
            ];
        }

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                include: {
                    items: {
                        include: { product: true },
                    },
                    payments: true,
                    tenantUser: {
                        include: { user: true },
                    },
                },
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
            }),
            prisma.order.count({ where }),
        ]);

        return {
            orders,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    //Get order statistics
    static async getStats(input: {
        tenantUuid: string;
        storeUuid?: string;
        startDate?: Date;
        endDate?: Date;
    }){
        const where: any = {
            tenantUuid: input.tenantUuid,
        };

        if (input.storeUuid) {
            where.storeUuid = input.storeUuid;
        }

        if (input.startDate || input.endDate) {
            where.createdAt = {
                ...(input.startDate && { gte: input.startDate }),
                ...(input.endDate && { lte: input.endDate }),
            };
        }

        const [
            totalOrders,
            completedOrders,
            cancelledOrders,
            pendingOrders,
            totalRevenue,
        ] = await Promise.all([
            prisma.order.count({ where }),
            prisma.order.count({ where: { ...where, status: "COMPLETED" } }),
            prisma.order.count({ where: { ...where, status: "CANCELLED" } }),
            prisma.order.count({
                where: { ...where, status: { in: ["PENDING", "PREPARING", "READY"] } },
            }),
            prisma.order.aggregate({
                where: { ...where, status: "COMPLETED" },
                _sum: { totalAmount: true },
            }),
        ]);

        const averageOrderValue =
          completedOrders > 0
            ? Math.round((totalRevenue._sum.totalAmount || 0) / completedOrders)
            : 0;

        return {
            totalOrders,
            completedOrders,
            cancelledOrders,
            pendingOrders,
            totalRevenue: totalRevenue._sum.totalAmount || 0,
            averageOrderValue,
            completionRate:
                totalOrders > 0
                ? Math.round((completedOrders / totalOrders) * 100)
                : 0,
        };
    }

    //Get active orders for kitchen display
    static async getActiveOrders(input: {
        tenantUuid: string;
        storeUuid: string;
    }) {
        return prisma.order.findMany({
            where: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                status: { in: ["PAID", "PREPARING", "READY"] },
            },
            include: {
                items: {
                    include: { product: true },
                },
            },
            orderBy: { createdAt: "asc" },
        });
    }

    //Get order timeline (status history + events)
    static async getTimeline(input: {
        tenantUuid: string;
        orderUuid: string;
    }) {
        const [order, statusHistory] = await Promise.all([
            prisma.order.findFirst({
                where: {
                uuid: input.orderUuid,
                tenantUuid: input.tenantUuid,
                },
            }),
            prisma.orderStatusHistory.findMany({
                where: {
                orderUuid: input.orderUuid,
                },
                orderBy: { createdAt: "asc" },
            }),
        ]);

        if (!order) {
            throw new Error("ORDER_NOT_FOUND");
        }

    // Build timeline
    const timeline = [
        {
            timestamp: order.createdAt,
            event: "ORDER_CREATED",
            status: "PENDING",
            description: "Order placed",
        },
        ...statusHistory.map((h) => ({
            timestamp: h.createdAt,
            event: "STATUS_CHANGED",
            status: h.toStatus,
            description: `Status changed to ${h.toStatus}`,
            changedBy: h.changedBy,
            reason: h.reason,
        })),
    ];

    return timeline;
  }
 
}