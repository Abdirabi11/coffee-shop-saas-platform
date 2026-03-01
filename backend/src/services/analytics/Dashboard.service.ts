import prisma from "../../config/prisma.ts"

export class DashboardService{
    static async getOverview(input: {
        tenantUuid: string;
        storeUuid?: string;
        dateFrom: Date;
        dateTo: Date;
    }) {
        const where: any = {
            tenantUuid: input.tenantUuid,
            createdAt: {
              gte: input.dateFrom,
              lte: input.dateTo,
            },
        };
      
        if (input.storeUuid) {
            where.storeUuid = input.storeUuid;
        };

        // Get order stats
        const orders = await prisma.order.aggregate({
            where: {
                ...where,
                status: "COMPLETED",
            },
            _sum: {
                totalAmount: true,
            },
            _count: {
                uuid: true,
            },
            _avg: {
                totalAmount: true,
            },
        });
  
        // Get new customers
        const newCustomers = await prisma.tenantUser.count({
            where: {
                tenantUuid: input.tenantUuid,
                role: "CUSTOMER",
                createdAt: {
                    gte: input.dateFrom,
                    lte: input.dateTo,
                },
            },
        });
    
        // Get active orders
        const activeOrders = await prisma.order.count({
            where: {
                ...where,
                status: { in: ["PENDING", "PAID", "PREPARING", "READY"] },
            },
        });
  
        // Get cancelled orders
        const cancelledOrders = await prisma.order.count({
            where: {
                ...where,
                status: "CANCELLED",
            },
        });
  
        // Calculate completion rate
        const totalOrders = orders._count.uuid + cancelledOrders;
        const completionRate = totalOrders > 0
            ? (orders._count.uuid / totalOrders) * 100
            : 0;
  
        return {
            revenue: {
                total: orders._sum.totalAmount || 0,
                average: orders._avg.totalAmount || 0,
            },
            orders: {
                total: orders._count.uuid,
                active: activeOrders,
                cancelled: cancelledOrders,
                completionRate: Math.round(completionRate),
            },
            customers: {
                new: newCustomers,
            },
        };
    }

    //Get revenue chart data
    static async getRevenueChart(input: {
        tenantUuid: string;
        storeUuid?: string;
        dateFrom: Date;
        dateTo: Date;
        groupBy: "hour" | "day" | "week" | "month";
    }) {
        // Use HourlyRevenue or OrderDailyMetrics depending on groupBy
        if (input.groupBy === "hour") {
            return this.getHourlyRevenue(input);
        } else {
            return this.getDailyRevenue(input);
        } 
    }

    private static async getHourlyRevenue(input: {
        tenantUuid: string;
        storeUuid?: string;
        dateFrom: Date;
        dateTo: Date;
    }) {
        const where: any = {
            hour: {
                gte: input.dateFrom,
                lte: input.dateTo,
            },
        };
    
        if (input.storeUuid) {
            where.storeUuid = input.storeUuid;
        }
    
        const data = await prisma.hourlyRevenue.findMany({
            where,
            orderBy: { hour: "asc" },
        });
    
        return data.map((d) => ({
            date: d.hour,
            revenue: d.revenue,
            orders: d.ordersCount,
        }));
    }
    
    private static async getDailyRevenue(input: {
        tenantUuid: string;
        storeUuid?: string;
        dateFrom: Date;
        dateTo: Date;
    }) {
        const where: any = {
            tenantUuid: input.tenantUuid,
            date: {
                gte: input.dateFrom,
                lte: input.dateTo,
            },
        };
    
        if (input.storeUuid) {
            where.storeUuid = input.storeUuid;
        }
    
        const data = await prisma.orderDailyMetrics.findMany({
            where,
            orderBy: { date: "asc" },
        });
    
        return data.map((d) => ({
            date: d.date,
            revenue: d.totalRevenue,
            orders: d.totalOrders,
        }));
    }

    //Get top products
    static async getTopProducts(input: {
        tenantUuid: string;
        storeUuid?: string;
        dateFrom: Date;
        dateTo: Date;
        limit?: number;
    }) {
        const where: any = {
            tenantUuid: input.tenantUuid,
            date: {
                gte: input.dateFrom,
                lte: input.dateTo,
            },
        };

        if (input.storeUuid) {
            where.storeUuid = input.storeUuid;
        };

        const products = await prisma.productDailyMetrics.groupBy({
            by: ["productUuid"],
            where,
            _sum: {
                quantitySold: true,
                revenueGross: true,
            },
            orderBy: {
                _sum: {
                quantitySold: "desc",
                },
            },
            take: input.limit || 10,
        });

        // Get product details
        const productDetails = await prisma.product.findMany({
            where: {
                uuid: { in: products.map((p) => p.productUuid) },
            },
            select: {
                uuid: true,
                name: true,
                basePrice: true,
                imageUrls: true,
            },
        });

        return products.map((p) => {
            const details = productDetails.find((d) => d.uuid === p.productUuid);
            return {
                product: details,
                quantitySold: p._sum.quantitySold || 0,
                revenue: p._sum.revenueGross || 0,
            };
        });
    }

    //Get category performance
    static async getCategoryPerformance(input: {
        tenantUuid: string;
        storeUuid?: string;
        dateFrom: Date;
        dateTo: Date;
    }) {
        const where: any = {
            tenantUuid: input.tenantUuid,
            date: {
                gte: input.dateFrom,
                lte: input.dateTo,
            },
        };

        if (input.storeUuid) {
            where.storeUuid = input.storeUuid;
        };

        const categories = await prisma.categoryDailyMetrics.groupBy({
            by: ["categoryUuid"],
            where,
            _sum: {
                itemsSold: true,
                revenue: true,
                ordersCount: true,
            },
        });

        // Get category details
        const categoryDetails = await prisma.category.findMany({
            where: {
                uuid: { in: categories.map((c) => c.categoryUuid) },
            },
            select: {
                uuid: true,
                name: true,
            },
        });

        return categories.map((c) => {
            const details = categoryDetails.find((d) => d.uuid === c.categoryUuid);
            return {
                category: details,
                itemsSold: c._sum.itemsSold || 0,
                revenue: c._sum.revenue || 0,
                orders: c._sum.ordersCount || 0,
            };
        });
    }
}