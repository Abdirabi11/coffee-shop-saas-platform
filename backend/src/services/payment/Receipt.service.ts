import type { Prisma } from "@prisma/client";
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
 
// Who the receipt email goes to, and where it is filed
interface ReceiptContext {
    tenantUuid: string;
    storeUuid: string;
    // The order's customer is staff at this store (a POS order entered by a
    // cashier for a walk-in): no automatic email, it would go to the cashier
    customerIsStaff: boolean;
}

export class ReceiptService {
    // The receipt for a payment, for display. No email is sent. The receipt
    // number is kept on the payment, so every view shows the same one.
    static async generate(paymentUuid: string): Promise<ReceiptData | null> {
        return (await this.build(paymentUuid))?.receipt ?? null;
    }

    // After a payment completes (PAYMENT_CONFIRMED / CASHIER_PAYMENT_COMPLETED):
    // queues the receipt email to the customer, once per payment.
    static async issueOnPayment(paymentUuid: string): Promise<"QUEUED" | "NO_RECIPIENT" | "ALREADY_SENT" | "NOT_FOUND"> {
        const built = await this.build(paymentUuid);
        if (!built) return "NOT_FOUND";
        const { receipt, context } = built;

        if (!receipt.customerEmail || context.customerIsStaff) return "NO_RECIPIENT";

        // Claim the one automatic email (a redelivered event can't send it
        // twice) and queue it in the same transaction, so a failed insert
        // releases the claim
        const customerEmail = receipt.customerEmail;
        return prisma.$transaction(async (tx) => {
            const claimed = await tx.payment.updateMany({
                where: { uuid: paymentUuid, receiptEmailQueuedAt: null },
                data: { receiptEmailQueuedAt: new Date() },
            });
            if (claimed.count === 0) return "ALREADY_SENT" as const;

            await this.queueEmailReceipt(customerEmail, receipt, context, tx);
            return "QUEUED" as const;
        });
    }

    private static async build(paymentUuid: string): Promise<{ receipt: ReceiptData; context: ReceiptContext } | null> {
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
                                    user: { select: { uuid: true, name: true, email: true, phoneNumber: true } },
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
    
            // A number the POS supplied, or one derived from the payment so it
            // is the same on every view
            const receiptNumber = payment.receiptNumber
                ?? `RCP-${order.orderNumber}-${payment.uuid.slice(0, 8).toUpperCase()}`;
        
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
                // Name and prices as frozen on the order item at order time
                // (unitPrice includes options; subtotal = unitPrice x quantity)
                items: order.items.map((item) => ({
                    name: item.productName ?? item.product?.name ?? "Item",
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    options: item.selectedOptions ? this.formatOptions(item.selectedOptions) : undefined,
                    subtotal: item.subtotal,
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
        
            // Keep the number on the payment (never overwrites one already set)
            if (!payment.receiptNumber) {
                await prisma.payment.updateMany({
                    where: { uuid: paymentUuid, receiptNumber: null },
                    data: { receiptNumber },
                });
            }

            const customerIsStaff = customer
                ? await this.isStaffAtStore(customer.uuid, payment.tenantUuid, payment.storeUuid)
                : false;

            return {
                receipt: receiptData,
                context: { tenantUuid: payment.tenantUuid, storeUuid: payment.storeUuid, customerIsStaff },
            };
        } catch (error: any) {
            logWithContext("error", "[Receipt] Generation failed", {
                paymentUuid,
                error: error.message,
            });
            return null;
        }
    }

    private static async isStaffAtStore(userUuid: string, tenantUuid: string, storeUuid: string): Promise<boolean> {
        const [assignment, tenant] = await Promise.all([
            prisma.userStore.findFirst({
                where: { userUuid, storeUuid, tenantUuid, isActive: true },
                select: { uuid: true },
            }),
            prisma.tenant.findUnique({ where: { uuid: tenantUuid }, select: { ownerUuid: true } }),
        ]);
        return !!assignment || tenant?.ownerUuid === userUuid;
    }
 
    // Queue the receipt email; EmailOutboxProcessorJob sends it
    private static async queueEmailReceipt(
        email: string,
        data: ReceiptData,
        context: ReceiptContext,
        db: Prisma.TransactionClient = prisma
    ) {
        await db.emailOutbox.create({
            data: {
                tenantUuid: context.tenantUuid,
                storeUuid: context.storeUuid,
                to: [email],
                subject: `Receipt for Order ${data.orderNumber}`,
                templateKey: "receipt",
                templateData: {
                    receiptNumber: data.receiptNumber,
                    customerName: data.customerName,
                    orderNumber: data.orderNumber,
                    orderDate: data.orderDate.toISOString(),
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
                tags: ["receipt"],
            },
        });

        logWithContext("info", "[Receipt] Email queued", {
            orderNumber: data.orderNumber,
            receiptNumber: data.receiptNumber,
        });
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
 
    // Staff re-send: one email, to the given address or the customer's
    static async resend(paymentUuid: string, email?: string) {
        const built = await this.build(paymentUuid);
        if (!built) {
            throw new Error("RECEIPT_NOT_FOUND");
        };
        const { receipt, context } = built;
    
        // A walk-in rung up under a cashier's account has no customer address:
        // staff must give one rather than mail the cashier
        const targetEmail = email ?? (context.customerIsStaff ? undefined : receipt.customerEmail);
        if (!targetEmail) {
            throw new Error("NO_EMAIL_ADDRESS");
        };
    
        await this.queueEmailReceipt(targetEmail, receipt, context);
    
        logWithContext("info", "[Receipt] Resent", { paymentUuid });
    
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
        // OrderItem.selectedOptions: [{ groupName, optionName, optionUuid, cost }]
        if (Array.isArray(options)) {
            return options
                .map((o) => (o && typeof o === "object" ? o.optionName ?? o.name ?? "" : String(o)))
                .filter(Boolean)
                .join(", ");
        }
        if (typeof options === "object") {
            return Object.entries(options)
                .map(([k, v]) => `${k}: ${v}`)
                .join(", ");
        }
        return "";
    }
}