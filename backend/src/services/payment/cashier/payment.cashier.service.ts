import { PaymentEventBus } from "../../../events/eventBus.ts";
import prisma from "../../config/prisma.ts"
import { PaymentAnomalyDetector } from "../paymentAnomalyDetector.ts";

interface ProcessCashierPaymentInput {
    orderUuid: string;
    paymentMethod: "CASH" | "CARD_TERMINAL";
    amountTendered?: number;    
    changeGiven?: number;       
    processedBy: string;        
    deviceId: string;         
    terminalId: string;        
    ipAddress?: string;
    receiptNumber?: string;  
    notes?: string;
    idempotencyKey: string;
};

export class CashierPaymentService{
    static async processPayment(input: ProcessCashierPaymentInput){
        const existingIdempotency= await prisma.idempotencyKey.findUnique({
            where: {
                tenantUuid_key_route: {
                    tenantUuid: input.tenantUuid,
                    key: input.idempotencyKey,
                    route: "POST /payments/cashier/process",
                },
            }
        });
        if (existingIdempotency) {
            return JSON.parse(existingIdempotency.response as string);
        };

        const order= await prisma.order.findUnique({
            where: { uuid: input.orderUuid},
            include: { payment: true, items: true },
        })

        if (!order) {
            throw new Error("Order not found");
        };
        if (order.payment) {
            throw new Error("Payment already declared for this order");
        }
        if (order.status !== "READY") {
            throw new Error(`Cannot declare payment for order in status: ${order.status}`);
        };

        if (input.paymentMethod === "CASH") {
            if (!input.amountTendered) {
                throw new Error("Amount tendered required for cash payments");
            }
      
            const expectedChange = input.amountTendered - order.totalAmount;
            
            if (input.changeGiven !== expectedChange) {
                throw new Error(
                    `Change calculation error: Expected ${expectedChange}, got ${input.changeGiven}`
                );
            }
      
            if (input.amountTendered < order.totalAmount) {
                throw new Error("Amount tendered less than order total");
            }
        };

        //Validate amount matches order total
        const amountDifference= Math.abs(input.amount - order.totalAmount);
        const TOLERANCE = 100;

        if (amountDifference > TOLERANCE) {
            throw new Error(
              `Payment amount ${input.amount} does not match order total ${order.totalAmount}`
            );
        };

        const drawer = await this.getActiveCashDrawer(
            order.storeUuid,
            input.terminalId
        );
      
        //Create payment
        const payment= await prisma.$transaction(async (tx) => {
            const payment= await tx.payment.create({
                data: {
                    orderUuid: input.orderUuid,
                    tenantUuid: order.tenantUuid,
                    storeUuid: order.storeUuid,
                    
                    amount: order.totalAmount,
                    currency: order.currency,
                    subtotal: order.subtotal,
                    tax: order.taxAmount,
                    discount: order.discountAmount,
        
                    paymentFlow: "CASHIER",
                    paymentMethod: input.paymentMethod,
                    status: "COMPLETED", 
                    
                    amountTendered: input.amountTendered,
                    changeGiven: input.changeGiven,
                    
                    processedBy: input.processedBy,
                    processedAt: new Date(),
                    deviceId: input.deviceId,
                    terminalId: input.terminalId,
                    ipAddress: input.ipAddress,
                    
                    receiptNumber: input.receiptNumber,
                    receiptPrinted: false,
                    
                    snapshot: {
                        notes: input.notes,
                        terminalId: input.terminalId,
                        drawerSessionUuid: drawer?.uuid,
                    },
                    orderSnapshot: {
                        orderNumber: order.orderNumber,
                        items: order.items,
                    },
                    pricingRules: {
                        subtotal: order.subtotal,
                        tax: order.taxAmount,
                        discount: order.discountAmount,
                    },
                } 
            });

            // Update order - MARK AS PAID
            await tx.order.update({
                where: { uuid: input.orderUuid },
                data: {
                    status: "PAID",
                    paymentStatus: "COMPLETED",
                },
            });

            if(drawer){
                await tx.cashDrawer.update({
                    where: {uuid: drawer.uuid},
                    data: {
                        expectedCash:{
                            increment: input.paymentMethod === "CASH"
                              ? input.amountTendered - input.changeGiven
                              : 0
                        },
                        expectedCard: {
                            increment: input.paymentMethod === "CARD_TERMINAL"
                              ? order.totalAmount
                              : 0,
                        },
                        cashSalesCount: {
                            increment: input.paymentMethod === "CASH" ? 1 : 0,
                        },
                        cardSalesCount: {
                            increment: input.paymentMethod === "CARD_TERMINAL" ? 1 : 0,
                        },
                        totalSales: { increment: order.totalAmount },
                    }
                })
            };

            //audit snapshot
            await tx.paymentAuditSnapshot.create({
                data: {
                    tenantUuid: order.tenantUuid,
                    paymentUuid: payment.uuid,
                    orderUuid: order.uuid,
                    storeUuid: order.storeUuid,
                    reason: "PAYMENT_PROCESSED",
                    triggeredBy: input.processedBy,
                    beforeStatus: null,
                    afterStatus: "COMPLETED",
                    paymentState: payment,
                    orderState: order,
                    metadata: {
                        paymentMethod: input.paymentMethod,
                        deviceId: input.deviceId,
                        terminalId: input.terminalId,
                    },
                },
            });

            return payment;
        });

        //Storing idempotency key
        await prisma.idempotencyKey.create({
            data: {
                tenantUuid: order.tenantUuid,
                key: input.idempotencyKey,
                route: "POST /payments/cashier/process",
                response: payment,
                statusCode: 201,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
            },
        });

        PaymentEventBus.emit("CASHIER_PAYMENT_COMPLETED", {
            paymentUuid: payment.uuid,
            orderUuid: payment.orderUuid,
            tenantUuid: payment.tenantUuid,
            storeUuid: payment.storeUuid,
            amount: payment.amount,
            paymentMethod: payment.paymentMethod,
            processedBy: input.processedBy,
            timestamp: payment.declaredAt,
            terminalId: input.terminalId,
        });
  
        // Run anomaly detection (async - doesn't block response)
        setImmediate(() => {
            PaymentAnomalyDetector.analyze(payment.uuid).catch((err) => {
                console.error("[AnomalyDetection] Failed:", err);
            });
        });
  
        console.log(`[CashierPayment] Processed: ${payment.uuid}`);
        return payment;
    }

    //Void payment (requires manager role)
    static async voidPayment(input: {
        paymentUuid: string;
        voidedBy: string;
        voidReason: string;
        managerPin?: string;
    }) {
        if (!input.voidReason || input.voidReason.trim().length < 10) {
            throw new Error("Void reason must be at least 10 characters");
        }
      
        const payment = await prisma.payment.findUnique({
            where: { uuid: input.paymentUuid },
            include: { order: true },
        });
        if (!payment) {
            throw new Error("Payment not found");
        };
        if (payment.status !== "COMPLETED") {
            throw new Error(`Cannot void payment in status: ${payment.status}`);
        };
        
        const paymentAge = Date.now() - payment.processedAt.getTime();
        const MAX_VOID_AGE = 24 * 60 * 60 * 1000; 

        if (paymentAge > MAX_VOID_AGE) {
            throw new Error("Payment too old to void - issue refund instead");
        };

        const updated = await prisma.$transaction(async (tx) => {
            const updated = await tx.payment.update({
                where: { uuid: input.paymentUuid },
                data: {
                    status: "VOIDED",
                    voidedBy: input.voidedBy,
                    voidedAt: new Date(),
                    voidReason: input.voidReason,
                },
            });

            // Updating order back to READY
            await tx.order.update({
                where: { uuid: payment.orderUuid },
                data: {
                    status: "READY",
                    paymentStatus: "PENDING",
                },
            });

            // Reverse cash drawer entry
            const drawer = await tx.cashDrawer.findFirst({
                where: {
                    storeUuid: payment.storeUuid,
                    terminalId: payment.terminalId,
                    status: "OPEN",
                },
            });

            if (drawer) {
                await tx.cashDrawer.update({
                    where: { uuid: drawer.uuid },
                    data: {
                        expectedCash: {
                        decrement: payment.paymentMethod === "CASH"
                            ? payment.amount
                            : 0,
                        },
                        expectedCard: {
                        decrement: payment.paymentMethod === "CARD_TERMINAL"
                            ? payment.amount
                            : 0,
                        },
                        totalSales: { decrement: payment.amount },
                    },
                });
            };

            // Audit snapshot
            await tx.paymentAuditSnapshot.create({
                data: {
                    tenantUuid: payment.tenantUuid,
                    paymentUuid: payment.uuid,
                    orderUuid: payment.orderUuid,
                    storeUuid: payment.storeUuid,
                    reason: "PAYMENT_VOIDED",
                    triggeredBy: input.voidedBy,
                    beforeStatus: "COMPLETED",
                    afterStatus: "VOIDED",
                    paymentState: updated,
                    orderState: payment.order,
                    metadata: {
                      voidReason: input.voidReason,
                    },
                },
            });

            return updated;
        });

        PaymentEventBus.emit("PAYMENT_VOIDED", {
            paymentUuid: updated.uuid,
            orderUuid: updated.orderUuid,
            voidedBy: input.voidedBy,
            voidReason: input.voidReason,
        });

        return updated;
    }

    //Get active cash drawer for terminal
    private static async getActiveCashDrawer(
        storeUuid: string,
        terminalId: string
    ) {
        return prisma.cashDrawer.findFirst({
            where: {
                storeUuid,
                terminalId,
                status: "OPEN",
            },
        });
    }

    //Correct payment amount (rare - accounting errors)
    static async correctPayment(input: {
        paymentUuid: string;
        correctAmount: number;
        correctedBy: string;
        correctionReason: string;
    }) {
        const payment = await prisma.payment.findUnique({
            where: { uuid: input.paymentUuid },
        });
      
        if (!payment) {
            throw new Error("Payment not found");
        };

        const updated = await prisma.payment.update({
            where: { uuid: input.paymentUuid },
            data: {
              originalAmount: payment.amount,
              amount: input.correctAmount,
              correctedBy: input.correctedBy,
              correctedAt: new Date(),
              correctionReason: input.correctionReason,
            },
        });
      
        PaymentEventBus.emit("PAYMENT_CORRECTED", {
            paymentUuid: updated.uuid,
            originalAmount: payment.amount,
            correctedAmount: input.correctAmount,
            correctedBy: input.correctedBy,
        });

        return updated;
    }
};