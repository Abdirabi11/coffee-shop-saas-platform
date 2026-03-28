import { EventBus, PaymentEventBus } from "../../../events/eventBus.ts";
import { logWithContext } from "../../../infrastructure/observability/logger.ts";
import prisma from "../../config/prisma.ts"
import { PaymentAnomalyDetector } from "../paymentAnomalyDetector.ts";

interface ProcessCashierPaymentInput {
    orderUuid: string;
    tenantUuid: string;
    paymentMethod: "CASH" | "CARD_TERMINAL";
    amount: number;
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
    static async processPayment(input: ProcessCashierPaymentInput) {
        // Idempotency check
        const existingIdempotency = await prisma.idempotencyKey.findUnique({
            where: {
                tenantUuid_key_route: {
                    tenantUuid: input.tenantUuid,
                    key: input.idempotencyKey,
                    route: "POST /payments/cashier/process",
                },
            },
        });
        if (existingIdempotency) {
            return JSON.parse(existingIdempotency.response as string);
        };
 
        const order = await prisma.order.findUnique({
            where: { uuid: input.orderUuid },
            include: { payment: true, items: true },
        });
    
        if (!order) {
            throw new Error("ORDER_NOT_FOUND");
        }
        if (order.payment) {
            throw new Error("PAYMENT_ALREADY_EXISTS");
        }
        if (order.status !== "READY") {
            throw new Error(`INVALID_ORDER_STATUS: ${order.status}`);
        }
    
        // Cash-specific validations
        if (input.paymentMethod === "CASH") {
            if (!input.amountTendered) {
                throw new Error("AMOUNT_TENDERED_REQUIRED");
            }
            if (input.amountTendered < order.totalAmount) {
                throw new Error("INSUFFICIENT_AMOUNT_TENDERED");
            }
        
            const expectedChange = input.amountTendered - order.totalAmount;
            if (input.changeGiven !== expectedChange) {
                throw new Error(
                    `CHANGE_CALCULATION_ERROR: Expected ${expectedChange}, got ${input.changeGiven}`
                );
            }
        };
 
        // Validate amount matches order total (with tolerance for rounding)
        const amountDifference = Math.abs(input.amount - order.totalAmount);
        const TOLERANCE = 100; // 1 dollar tolerance
    
        if (amountDifference > TOLERANCE) {
            throw new Error(
                `AMOUNT_MISMATCH: Payment ${input.amount} vs order ${order.totalAmount}`
            );
        };
 
        const drawer = await this.getActiveCashDrawer(
            order.tenantUuid,
            order.storeUuid,
            input.terminalId
        );
    
        // Create payment in transaction
        const payment = await prisma.$transaction(async (tx) => {
            const payment = await tx.payment.create({
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
                },
            });
        
            // Mark order as paid
            await tx.order.update({
                where: { uuid: input.orderUuid },
                data: {
                    status: "PAID",
                    paymentStatus: "COMPLETED",
                },
            });
    
            // Update cash drawer
            if (drawer) {
                // For cash: the net cash added to the drawer is (tendered - change)
                const netCashAdded =
                input.paymentMethod === "CASH"
                    ? (input.amountTendered ?? 0) - (input.changeGiven ?? 0)
                    : 0;
        
                await tx.cashDrawer.update({
                    where: { uuid: drawer.uuid },
                    data: {
                        expectedCash: {
                            increment: netCashAdded,
                        },
                        expectedCard: {
                            increment:
                                input.paymentMethod === "CARD_TERMINAL"
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
                    },
                });
            }
    
            // Audit snapshot
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
        
        // Store idempotency key
        await prisma.idempotencyKey.create({
            data: {
                tenantUuid: order.tenantUuid,
                key: input.idempotencyKey,
                route: "POST /payments/cashier/process",
                response: payment,
                statusCode: 201,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
        });
 
        EventBus.emit("CASHIER_PAYMENT_COMPLETED", {
            paymentUuid: payment.uuid,
            orderUuid: payment.orderUuid,
            tenantUuid: payment.tenantUuid,
            storeUuid: payment.storeUuid,
            amount: payment.amount,
            paymentMethod: payment.paymentMethod,
            processedBy: input.processedBy,
            timestamp: payment.processedAt, // FIX #2: Was `payment.declaredAt`
            terminalId: input.terminalId,
        });
 
        // Run anomaly detection (async — doesn't block response)
        setImmediate(() => {
            PaymentAnomalyDetector.analyze(payment.uuid).catch((err) => {
                logWithContext("error", "[AnomalyDetection] Failed", {
                    paymentUuid: payment.uuid,
                    error: err.message,
                });
            });
        });
    
        logWithContext("info", "[CashierPayment] Processed", {
            paymentUuid: payment.uuid,
            orderUuid: order.uuid,
            method: input.paymentMethod,
            amount: order.totalAmount,
        });
 
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
            throw new Error("VOID_REASON_TOO_SHORT");
        }
    
        const payment = await prisma.payment.findUnique({
            where: { uuid: input.paymentUuid },
            include: { order: true },
        });
    
        if (!payment) {
            throw new Error("PAYMENT_NOT_FOUND");
        }
        if (payment.status !== "COMPLETED") {
            throw new Error(`CANNOT_VOID_STATUS: ${payment.status}`);
        }
    
        // Void window: 24 hours
        const paymentAge = Date.now() - (payment.processedAt?.getTime() ?? payment.createdAt.getTime());
        const MAX_VOID_AGE = 24 * 60 * 60 * 1000;
    
        if (paymentAge > MAX_VOID_AGE) {
            throw new Error("PAYMENT_TOO_OLD_TO_VOID");
        }
 
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
    
            // Revert order to READY
            await tx.order.update({
                where: { uuid: payment.orderUuid },
                data: {
                    status: "READY",
                    paymentStatus: "PENDING",
                },
            });
        
            const drawer = await tx.cashDrawer.findFirst({
                where: {
                    storeUuid: payment.storeUuid,
                    terminalId: payment.terminalId,
                    status: "OPEN",
                    tenantUuid: payment.tenantUuid, // FIX #3: tenant isolation
                },
            });
        
            if (drawer) {
                // FIX #1: Reverse the EXACT amount that was added to the drawer
                const cashToReverse =
                payment.paymentMethod === "CASH"
                    ? (payment.amountTendered ?? 0) - (payment.changeGiven ?? 0)
                    : 0;
        
                await tx.cashDrawer.update({
                    where: { uuid: drawer.uuid },
                    data: {
                        expectedCash: {
                            decrement: cashToReverse,
                        },
                        expectedCard: {
                            decrement:
                                payment.paymentMethod === "CARD_TERMINAL"
                                ? payment.amount
                                : 0,
                            },
                            cashSalesCount: {
                            decrement: payment.paymentMethod === "CASH" ? 1 : 0,
                        },
                        cardSalesCount: {
                            decrement: payment.paymentMethod === "CARD_TERMINAL" ? 1 : 0,
                        },
                        totalSales: { decrement: payment.amount },
                    },
                });
            }
        
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
    
        EventBus.emit("PAYMENT_VOIDED", {
            paymentUuid: updated.uuid,
            orderUuid: updated.orderUuid,
            tenantUuid: payment.tenantUuid,
            storeUuid: payment.storeUuid,
            voidedBy: input.voidedBy,
            voidReason: input.voidReason,
        });
 
        logWithContext("warn", "[CashierPayment] Voided", {
            paymentUuid: updated.uuid,
            voidedBy: input.voidedBy,
            reason: input.voidReason,
        });
    
        return updated;
    }

    //Get active cash drawer for terminal
    private static async getActiveCashDrawer(
        storeUuid: string,
        terminalId: string,
        tenantUuid: string,
    ) {
        return prisma.cashDrawer.findFirst({
            where: {
                tenantUuid,
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
 
        EventBus.emit("PAYMENT_CORRECTED", {
            paymentUuid: updated.uuid,
            tenantUuid: payment.tenantUuid,
            storeUuid: payment.storeUuid,
            originalAmount: payment.amount,
            correctedAmount: input.correctAmount,
            correctedBy: input.correctedBy,
        });
    
        logWithContext("warn", "[CashierPayment] Corrected", {
            paymentUuid: updated.uuid,
            originalAmount: payment.amount,
            correctedAmount: input.correctAmount,
        });

        return updated;
    }
};