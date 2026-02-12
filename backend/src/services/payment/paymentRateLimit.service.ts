import prisma from "../../config/prisma.js"


export class PaymentRateLimitService {
    //Check if user is rate limited
    static async checkLimit(input: {
        tenantUserUuid: string;
        amount: number;
    }): Promise<boolean> {
        // Check daily payment count
        const dailyPayments = await prisma.payment.count({
            where: {
            order: { tenantUserUuid: input.tenantUserUuid },
            createdAt: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
            },
        });
  
        if (dailyPayments >= 50) {
            throw new Error("DAILY_PAYMENT_LIMIT_EXCEEDED");
        }
    
        // Check daily amount limit
        const dailyTotal = await prisma.payment.aggregate({
            where: {
                order: { tenantUserUuid: input.tenantUserUuid },
                status: "PAID",
                paidAt: {
                    gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                },
            },
            _sum: { amount: true },
        });
  
        const totalSpent = dailyTotal._sum.amount || 0;
        const maxDailyAmount = 1000000;
    
        if (totalSpent + input.amount > maxDailyAmount) {
            throw new Error("DAILY_AMOUNT_LIMIT_EXCEEDED");
        }
    
        // Check hourly velocity
        const hourlyPayments = await prisma.payment.count({
            where: {
            order: { tenantUserUuid: input.tenantUserUuid },
            createdAt: {
                gte: new Date(Date.now() - 60 * 60 * 1000),
            },
            },
        });
    
        if (hourlyPayments >= 10) {
            throw new Error("HOURLY_PAYMENT_LIMIT_EXCEEDED");
        }
    
        return true;
    }
}