import prisma from "../../config/prisma.ts"


export class PaymentAnalyticsService {
    //Get payment metrics for date range
    static async getMetrics(input: {
        tenantUuid?: string;
        storeUuid?: string;
        startDate: Date;
        endDate: Date;
    }) {
        const payments = await prisma.payment.findMany({
            where: {
                ...(input.tenantUuid && { tenantUuid: input.tenantUuid }),
                ...(input.storeUuid && { storeUuid: input.storeUuid }),
                createdAt: {
                    gte: input.startDate,
                    lte: input.endDate,
                },
            },
        });
  
        const total = payments.length;
        const successful = payments.filter(p => p.status === "PAID").length;
        const failed = payments.filter(p => p.status === "FAILED").length;
        const cancelled = payments.filter(p => p.status === "CANCELLED").length;
  
        const totalAmount = payments
            .filter(p => p.status === "PAID")
            .reduce((sum, p) => sum + p.amount, 0);
    
        const averageAmount = successful > 0 ? totalAmount / successful : 0;
    
        // By payment method
        const byMethod = payments.reduce((acc, p) => {
            if (!acc[p.paymentMethod]) {
                acc[p.paymentMethod] = { count: 0, amount: 0 };
            }
            acc[p.paymentMethod].count++;
            if (p.status === "PAID") {
                acc[p.paymentMethod].amount += p.amount;
            }
            return acc;
        }, {} as Record<string, { count: number; amount: number }>);
  
        // Success rate
        const successRate = total > 0 ? (successful / total) * 100 : 0;
  
        // Average processing time
        const processingTimes = payments
            .filter(p => p.status === "PAID" && p.paidAt)
            .map(p => p.paidAt!.getTime() - p.createdAt.getTime());
        
        const avgProcessingTime = processingTimes.length > 0
            ? processingTimes.reduce((sum, t) => sum + t, 0) / processingTimes.length
            : 0;
  
        return {
            total,
            successful,
            failed,
            cancelled,
            successRate: Math.round(successRate * 100) / 100,
            totalAmount,
            averageAmount,
            byMethod,
            avgProcessingTime: Math.round(avgProcessingTime / 1000), // in seconds
        };
    }
  
    //Get fraud metrics
    static async getFraudMetrics(input: {
        tenantUuid?: string;
        startDate: Date;
        endDate: Date;
    }){
        const fraudEvents = await prisma.fraudEvent.findMany({
            where: {
                ...(input.tenantUuid && { tenantUuid: input.tenantUuid }),
                createdAt: {
                    gte: input.startDate,
                    lte: input.endDate,
                },
            },
        });
    
        const byType = fraudEvents.reduce((acc, e) => {
            acc[e.type] = (acc[e.type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    
        const bySeverity = fraudEvents.reduce((acc, e) => {
            acc[e.severity] = (acc[e.severity] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
  
        return {
            total: fraudEvents.length,
            byType,
            bySeverity,
        };
    }
}