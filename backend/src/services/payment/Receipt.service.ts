import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
 
 
interface ReceiptData {
    receiptNumber: string;
    orderNumber: string;
    orderDate: Date;
    storeName: string;
    storeAddress?: string;
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    paymentMethod: string;
    paymentFlow: string;
    transactionId?: string;
    items: Array<{
        name: string;
        quantity: number;
        unitPrice: number;
        options?: string;
        subtotal: number;
    }>;
    subtotal: number;
    tax: number;
    taxRate?: number;
    discount: number;
    tip?: number;
    total: number;
    amountTendered?: number;
    changeGiven?: number;
    currency: string;
    processedBy?: string;
}
 
export class ReceiptService {
    //Main entry point — called from payment event handlers
    static async generate(paymentUuid: string): Promise<ReceiptData | null> {
        try {
            const payment = await prisma.payment.findUnique({
                where: { uuid: paymentUuid },
                include: {
                    order: {
                        include: {
                            items: {
                                include: {
                                    product: { select: { name: true } },
                                },
                            },
                            store: {
                                select: { name: true, address: true, currency: true },
                            },
                            tenantUser: {
                                include: {
                                    user: { select: { name: true, email: true, phoneNumber: true } },
                                },
                            },
                        },
                    },
                },
            });
        
            if (!payment || !payment.order) {
                logWithContext("warn", "[Receipt] Payment or order not found", { paymentUuid });
                return null;
            }
        
            const order = payment.order;
            const store = order.store;
            const customer = order.tenantUser?.user;
    
            // Generate receipt number
            const receiptNumber = `RCP-${order.orderNumber}-${Date.now().toString(36).toUpperCase()}`;
        
            // Assemble receipt data
            const receiptData: ReceiptData = {
                receiptNumber,
                orderNumber: order.orderNumber,
                orderDate: payment.processedAt ?? payment.paidAt ?? payment.createdAt,
                storeName: store.name,
                storeAddress: store.address ?? undefined,
                customerName: customer?.name ?? "Guest",
                customerEmail: customer?.email ?? undefined,
                customerPhone: customer?.phoneNumber ?? undefined,
                paymentMethod: this.formatPaymentMethod(payment.paymentMethod),
                paymentFlow: payment.paymentFlow,
                transactionId: payment.providerRef ?? payment.receiptNumber ?? payment.uuid,
                items: order.items.map((item) => ({
                    name: item.product?.name ?? item.productName ?? "Item",
                    quantity: item.quantity,
                    unitPrice: item.unitPrice ?? item.price,
                    options: item.options ? this.formatOptions(item.options) : undefined,
                    subtotal: (item.unitPrice ?? item.price) * item.quantity,
                })),
                subtotal: payment.subtotal,
                tax: payment.tax,
                discount: payment.discount,
                total: payment.amount,
                currency: payment.currency,
                // Cashier-specific fields
                amountTendered: payment.amountTendered ?? undefined,
                changeGiven: payment.changeGiven ?? undefined,
                processedBy: payment.processedBy ?? undefined,
            };
        
            // Store receipt reference on payment
            if (!payment.receiptNumber) {
                await prisma.payment.update({
                    where: { uuid: paymentUuid },
                    data: { receiptNumber },
                });
            }
        
            // Queue email receipt if customer has email
            if (customer?.email) {
                await this.queueEmailReceipt(paymentUuid, customer.email, receiptData);
            };
        
            logWithContext("info", "[Receipt] Generated", {
                paymentUuid,
                receiptNumber,
                orderNumber: order.orderNumber,
                hasEmail: !!customer?.email,
            });
        
            return receiptData;
        } catch (error: any) {
            logWithContext("error", "[Receipt] Generation failed", {
                paymentUuid,
                error: error.message,
            });
            return null;
        }
    }
 
    //Queue email receipt via existing EmailService
    private static async queueEmailReceipt(
        paymentUuid: string,
        email: string,
        data: ReceiptData
    ) {
        try {
            // Use the existing EmailService outbox pattern
            await prisma.emailOutbox.create({
                data: {
                    to: email,
                    subject: `Receipt for Order ${data.orderNumber}`,
                    template: "receipt",
                    payload: {
                        type: "PAYMENT_RECEIPT",
                        customerName: data.customerName,
                        orderNumber: data.orderNumber,
                        orderDate: data.orderDate,
                        storeName: data.storeName,
                        storeAddress: data.storeAddress,
                        paymentMethod: data.paymentMethod,
                        transactionId: data.transactionId,
                        items: data.items,
                        subtotal: data.subtotal,
                        tax: data.tax,
                        discount: data.discount,
                        total: data.total,
                        amountTendered: data.amountTendered,
                        changeGiven: data.changeGiven,
                        currency: data.currency,
                    },
                    status: "PENDING",
                    priority: "NORMAL",
                },
            });
        
            logWithContext("info", "[Receipt] Email queued", {
                email,
                orderNumber: data.orderNumber,
            });
        } catch (error: any) {
            logWithContext("error", "[Receipt] Email queue failed", {
                email,
                error: error.message,
            });
        }
    }
 
    //Get receipt for order (customer-facing endpoint)
    static async getByOrder(orderUuid: string): Promise<ReceiptData | null> {
        const payment = await prisma.payment.findFirst({
            where: {
                orderUuid,
                status: { in: ["PAID", "COMPLETED"] },
            },
        });
    
        if (!payment) return null;
    
        return this.generate(payment.uuid);
    }
 
    // ── Re-send receipt email
    static async resend(paymentUuid: string, email?: string) {
        const receipt = await this.generate(paymentUuid);
        if (!receipt) {
            throw new Error("RECEIPT_NOT_FOUND");
        };
    
        const targetEmail = email ?? receipt.customerEmail;
        if (!targetEmail) {
            throw new Error("NO_EMAIL_ADDRESS");
        };
    
        await this.queueEmailReceipt(paymentUuid, targetEmail, receipt);
    
        logWithContext("info", "[Receipt] Resent", {
            paymentUuid,
            email: targetEmail,
        });
    
        return receipt;
    }
 
    private static formatPaymentMethod(method: string): string {
        const map: Record<string, string> = {
            CASH: "Cash",
            CARD_TERMINAL: "Card",
            STRIPE: "Credit/Debit Card",
            WALLET: "App Wallet",
            EVC_PLUS: "EVC Plus",
            ZAAD: "Zaad",
            EDAHAB: "eDahab",
            MPESA: "M-Pesa",
        };
        return map[method] ?? method;
    }
 
    private static formatOptions(options: any): string {
        if (typeof options === "string") return options;
        if (Array.isArray(options)) return options.join(", ");
        if (typeof options === "object") {
            return Object.entries(options)
                .map(([k, v]) => `${k}: ${v}`)
                .join(", ");
        }
        return "";
    }
}