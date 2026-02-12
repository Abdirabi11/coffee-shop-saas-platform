import { prisma } from "../../config/prisma.ts"


export class PartialPaymentService {

   //Create partial payment for order
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
            throw new Error("Order not found");
        }

        // Calculate remaining amount
        const paidAmount = order.payments
            .filter(p => p.status === "PAID")
            .reduce((sum, p) => sum + p.amount, 0);

        const remainingAmount = order.totalAmount - paidAmount;

        if (input.amount > remainingAmount) {
            throw new Error(`Amount exceeds remaining balance: ${remainingAmount}`);
        }

        // Create partial payment
        const payment = await prisma.payment.create({
            data: {
                orderUuid: order.uuid,
                tenantUuid: order.tenantUuid,
                storeUuid: order.storeUuid,
                amount: input.amount,
                currency: order.currency,
                paymentFlow: "CASHIER",
                paymentMethod: input.paymentMethod,
                status: "PAID",
                processedBy: input.processedBy,
                processedAt: new Date(),
                deviceId: input.deviceId,
                isPartial: true,
            },
        });

        // Check if order is fully paid
        const newPaidAmount = paidAmount + input.amount;
        if (newPaidAmount >= order.totalAmount) {
            await prisma.order.update({
                where: { uuid: order.uuid },
                data: {
                    status: "PAID",
                    paymentStatus: "COMPLETED",
                },
            });
        } else {
            await prisma.order.update({
                where: { uuid: order.uuid },
                data: {
                    paymentStatus: "PARTIALLY_PAID",
                },
            });
        }

        return payment;
    }

    //Get payment breakdown for order
    static async getPaymentBreakdown(orderUuid: string) {
        const order = await prisma.order.findUnique({
            where: { uuid: orderUuid },
            include: { payments: true },
        });

        if (!order) {
            throw new Error("Order not found");
        }

        const paidPayments = order.payments.filter(p => p.status === "PAID");
        const totalPaid = paidPayments.reduce((sum, p) => sum + p.amount, 0);
        const remaining = order.totalAmount - totalPaid;

        return {
            orderTotal: order.totalAmount,
            totalPaid,
            remaining,
            payments: paidPayments,
            isFullyPaid: remaining <= 0,
        };
    }
}