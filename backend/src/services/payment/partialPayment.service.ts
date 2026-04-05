import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";


export class PartialPaymentService {
    static async createPartial(input: {
        orderUuid: string;
        amount: number;
        paymentMethod: string;
        processedBy: string;
        deviceId: string;
    }) {
        const order = await prisma.order.findUnique({
            where: { uuid: input.orderUuid },
            include: { payments: true },
        });
    
        if (!order) {
            throw new Error("ORDER_NOT_FOUND");
        };
    
        const paidAmount = order.payments
            .filter((p) => p.status === "PAID" || p.status === "COMPLETED") // FIX #1
            .reduce((sum, p) => sum + p.amount, 0);
    
        const remainingAmount = order.totalAmount - paidAmount;
    
        if (input.amount > remainingAmount) {
            throw new Error(
                `EXCEEDS_REMAINING_BALANCE: Remaining ${remainingAmount}, requested ${input.amount}`
            );
        };
    
        if (input.amount <= 0) {
            throw new Error("INVALID_PARTIAL_AMOUNT");
        };
    
        // Create partial payment
        const payment = await prisma.payment.create({
            data: {
                orderUuid: order.uuid,
                tenantUuid: order.tenantUuid,
                storeUuid: order.storeUuid,
                amount: input.amount,
                currency: order.currency,
                subtotal: input.amount, // For partial, subtotal = amount
                tax: 0,
                discount: 0,
                paymentFlow: "CASHIER",
                paymentMethod: input.paymentMethod,
                status: "COMPLETED",
                processedBy: input.processedBy,
                processedAt: new Date(),
                deviceId: input.deviceId,
                isPartial: true,
                snapshot: {
                    partialPayment: true,
                    remainingBefore: remainingAmount,
                    remainingAfter: remainingAmount - input.amount,
                },
                orderSnapshot: {
                    orderNumber: order.orderNumber,
                    totalAmount: order.totalAmount,
                },
                pricingRules: {},
            },
        });
    
        // Check if order is now fully paid
        const newPaidAmount = paidAmount + input.amount;
        if (newPaidAmount >= order.totalAmount) {
            await prisma.order.update({
                where: { uuid: order.uuid },
                data: {
                    status: "PAID",
                    paymentStatus: "COMPLETED",
                },
            });
        
            logWithContext("info", "[PartialPayment] Order fully paid", {
                orderUuid: order.uuid,
                totalPaid: newPaidAmount,
            });
        } else {
            await prisma.order.update({
                where: { uuid: order.uuid },
                data: {
                    paymentStatus: "PARTIALLY_PAID",
                },
            });
        
            logWithContext("info", "[PartialPayment] Partial payment recorded", {
                orderUuid: order.uuid,
                paid: newPaidAmount,
                remaining: order.totalAmount - newPaidAmount,
            });
        }
    
        return payment;
    }
    
    // Get payment breakdown for order
    static async getPaymentBreakdown(orderUuid: string) {
        const order = await prisma.order.findUnique({
            where: { uuid: orderUuid },
            include: { payments: true },
        });
    
        if (!order) {
            throw new Error("ORDER_NOT_FOUND");
        }
    
        // FIX #1: Include both PAID and COMPLETED
        const paidPayments = order.payments.filter(
            (p) => p.status === "PAID" || p.status === "COMPLETED"
        );
        const totalPaid = paidPayments.reduce((sum, p) => sum + p.amount, 0);
        const remaining = order.totalAmount - totalPaid;
    
        return {
            orderTotal: order.totalAmount,
            totalPaid,
            remaining: Math.max(0, remaining),
            payments: paidPayments.map((p) => ({
                uuid: p.uuid,
                amount: p.amount,
                paymentMethod: p.paymentMethod,
                status: p.status,
                isPartial: p.isPartial,
                processedAt: p.processedAt,
            })),
            isFullyPaid: remaining <= 0,
        };
    }
}
 