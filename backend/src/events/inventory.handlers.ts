import dayjs from "dayjs";
import prisma from "../config/prisma.ts"
import { eventBus } from "./eventBus.ts";
import { InventoryOrderService } from "../services/inventory/InventoryOrder.service.ts";
import { logWithContext } from "../infrastructure/observability/Logger.ts";
import { bumpCacheVersion } from "../infrastructure/cache/cacheVersion.ts";
import { MetricsService } from "../infrastructure/observability/MetricsService.ts";
 

export function registerInventoryEventHandlers() {
 
    eventBus.on("PAYMENT_CONFIRMED", async (payload) => {
        const { orderUuid, tenantUuid, storeUuid } = payload;
    
        try {
            // Commit reservations (reserved → sold)
            await InventoryOrderService.commitForOrder({ orderUuid });
        
            // Update StoreDailyMetrics.itemsSold (GAP #5)
            await updateItemsSoldMetrics(orderUuid, tenantUuid, storeUuid);
        
            logWithContext("info", "[InventoryHandler] PAYMENT_CONFIRMED — stock committed", {
                orderUuid,
            });
        } catch (error: any) {
            // Log but don't throw — inventory failure shouldn't block payment confirmation
            logWithContext("error", "[InventoryHandler] PAYMENT_CONFIRMED commit failed", {
                orderUuid,
                error: error.message,
            });
        }
    });
 
    // No PAYMENT_FAILED release: a failed payment can still be retried and
    // succeed (FAILED -> PAID), so the reservation is kept until it expires
    // (ReservationExpiryJob) or the order is cancelled.

    // Moved from order.events.ts so it can be registered on its own.
    // releaseForOrder only touches ACTIVE reservations, so overlapping calls
    // (e.g. OrderCancellation.service releasing directly) are no-ops.
    eventBus.on("ORDER_STATUS_CHANGED", async (payload) => {
        const { orderUuid, to } = payload;

        if (to !== "CANCELLED" || !orderUuid) return;

        try {
            await InventoryOrderService.releaseForOrder({ orderUuid });

            logWithContext("info", "[InventoryHandler] ORDER_CANCELLED — stock released", {
                orderUuid,
            });
        } catch (error: any) {
            logWithContext("error", "[InventoryHandler] ORDER_CANCELLED release failed", {
                orderUuid,
                error: error.message,
            });
        }
    });
 
    eventBus.on("CASHIER_PAYMENT_COMPLETED", async (payload) => {
        const { orderUuid, tenantUuid, storeUuid, paymentUuid } = payload;
    
        try {
            // Check if this order already had inventory reserved
            // (some cashier orders might use the reservation flow)
            const hasReservation = await prisma.inventoryReservation.findFirst({
                where: { orderUuid, status: "ACTIVE" },
                select: { uuid: true },
            });
    
            if (hasReservation) {
                // Order had a reservation (app order processed by cashier) → commit
                await InventoryOrderService.commitForOrder({ orderUuid });
            } else {
                // Pure walk-in with no reservation → direct deduction
                const orderItems = await prisma.orderItem.findMany({
                    where: { orderUuid },
                    select: { productUuid: true, quantity: true },
                });
        
                if (orderItems.length > 0) {
                    await InventoryOrderService.deductForOrder({
                        orderUuid,
                        tenantUuid,
                        storeUuid,
                        items: orderItems.map((i) => ({
                            productUuid: i.productUuid,
                            quantity: i.quantity,
                        })),
                    });
                }
            }
        
            // Update itemsSold metrics (GAP #5)
            await updateItemsSoldMetrics(orderUuid, tenantUuid, storeUuid);
        
            logWithContext("info", "[InventoryHandler] CASHIER_PAYMENT — stock deducted", {
                orderUuid,
            });
        } catch (error: any) {
            logWithContext("error", "[InventoryHandler] CASHIER_PAYMENT deduct failed", {
                orderUuid,
                error: error.message,
            });
        }
    });
 
    eventBus.on("PAYMENT_VOIDED", async (payload) => {
        const { orderUuid, tenantUuid, storeUuid } = payload;
    
        if (!orderUuid) return;
    
        try {
            if (!(await hasUnreturnedSale(orderUuid))) {
                logWithContext("info", "[InventoryHandler] PAYMENT_VOIDED — no sold stock to return", {
                    orderUuid,
                });
                return;
            }

            // Void = add stock back (reverse of deduction)
            const orderItems = await prisma.orderItem.findMany({
                where: { orderUuid },
                select: { productUuid: true, quantity: true },
            });
        
            for (const item of orderItems) {
                const inventory = await prisma.inventoryItem.findFirst({
                    where: { tenantUuid, storeUuid, productUuid: item.productUuid },
                });
        
                if (!inventory) continue;
        
                // Add stock back
                await prisma.inventoryItem.update({
                    where: { uuid: inventory.uuid },
                    data: {
                        currentStock: { increment: item.quantity },
                        availableStock: { increment: item.quantity },
                        quantity: { increment: item.quantity }, // Legacy
                        status: "IN_STOCK",
                        lastUpdated: new Date(),
                    },
                });
        
                // Movement log (RETURN = stock coming back)
                await prisma.inventoryMovement.create({
                    data: {
                        tenantUuid,
                        storeUuid,
                        inventoryItemUuid: inventory.uuid,
                        productUuid: item.productUuid,
                        type: "RETURN",
                        quantity: item.quantity,
                        previousStock: inventory.currentStock,
                        newStock: inventory.currentStock + item.quantity,
                        referenceType: "ORDER",
                        referenceUuid: orderUuid,
                        reason: "Payment voided — stock returned",
                    },
                });
            }
        
            // Reverse the itemsSold count
            await reverseItemsSoldMetrics(orderUuid, tenantUuid, storeUuid);
        
            logWithContext("info", "[InventoryHandler] PAYMENT_VOIDED — stock returned", {
                orderUuid,
            });
        } catch (error: any) {
            logWithContext("error", "[InventoryHandler] PAYMENT_VOIDED return failed", {
                orderUuid,
                error: error.message,
            });
        }
    });
 
    eventBus.on("REFUND_COMPLETED", async (payload) => {
        const { orderUuid, tenantUuid, storeUuid, amount } = payload;
    
        if (!orderUuid) return;
    
        try {
            // Check if this is a full refund (return stock) or partial (don't)
            const order = await prisma.order.findUnique({
                where: { uuid: orderUuid },
                select: { totalAmount: true },
            });
        
            if (!order) return;
        
            // Only return stock for full refunds
            const isFullRefund = amount >= order.totalAmount;
            if (!isFullRefund) {
                logWithContext("info", "[InventoryHandler] Partial refund — no stock return", {
                    orderUuid,
                    refundAmount: amount,
                    orderTotal: order.totalAmount,
                });
                return;
            }
    
            if (!(await hasUnreturnedSale(orderUuid))) {
                logWithContext("info", "[InventoryHandler] REFUND_COMPLETED — no sold stock to return", {
                    orderUuid,
                });
                return;
            }

            // Return stock (same logic as void)
            const orderItems = await prisma.orderItem.findMany({
                where: { orderUuid },
                select: { productUuid: true, quantity: true },
            });
        
            for (const item of orderItems) {
                const inventory = await prisma.inventoryItem.findFirst({
                    where: { tenantUuid, storeUuid, productUuid: item.productUuid },
                });
        
                if (!inventory) continue;
        
                await prisma.inventoryItem.update({
                    where: { uuid: inventory.uuid },
                    data: {
                        currentStock: { increment: item.quantity },
                        availableStock: { increment: item.quantity },
                        quantity: { increment: item.quantity },
                        status: "IN_STOCK",
                        lastUpdated: new Date(),
                    },
                });
        
                await prisma.inventoryMovement.create({
                    data: {
                        tenantUuid,
                        storeUuid,
                        inventoryItemUuid: inventory.uuid,
                        productUuid: item.productUuid,
                        type: "RETURN",
                        quantity: item.quantity,
                        previousStock: inventory.currentStock,
                        newStock: inventory.currentStock + item.quantity,
                        referenceType: "ORDER",
                        referenceUuid: orderUuid,
                        reason: "Full refund — stock returned",
                    },
                });
            }
        
            await reverseItemsSoldMetrics(orderUuid, tenantUuid, storeUuid);
        
            logWithContext("info", "[InventoryHandler] REFUND_COMPLETED — stock returned", {
                orderUuid,
            });
        } catch (error: any) {
            logWithContext("error", "[InventoryHandler] REFUND stock return failed", {
                orderUuid,
                error: error.message,
            });
        }
    });
 
    eventBus.on("INVENTORY_LOW_STOCK", async (payload) => {
        const { tenantUuid, storeUuid, productName, currentStock, threshold } = payload;
    
        try {
            await Promise.all([
                bumpCacheVersion(`store:${storeUuid}:dashboard`),
                bumpCacheVersion(`store:${storeUuid}:inventory`),
                bumpCacheVersion(`tenant:${tenantUuid}:dashboard`),
            ]);
        
            MetricsService.increment("inventory.low_stock_alert", 1, { storeUuid });
        } catch (error: any) {
            logWithContext("error", "[InventoryHandler] Cache bust failed", {
                error: error.message,
            });
        }
    });
 
    eventBus.on("INVENTORY_ALERT", async (payload) => {
        const { tenantUuid, storeUuid } = payload;
    
        await bumpCacheVersion(`store:${storeUuid}:inventory`);
        await bumpCacheVersion(`store:${storeUuid}:dashboard`);
    });
    
    logWithContext("info", "[InventoryHandlers] All inventory event handlers registered", {});
}

// Stock is only returned on void/refund if the order actually sold it (a
// SALE movement from commitForOrder/deductForOrder) and it hasn't been
// returned since. Stops double returns when e.g. an order was cancelled
// (reservation already released) and its late capture is then refunded, or
// when a void is followed by a refund.
async function hasUnreturnedSale(orderUuid: string): Promise<boolean> {
    const lastSale = await prisma.inventoryMovement.findFirst({
        where: { referenceType: "ORDER", referenceUuid: orderUuid, type: "SALE" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
    });
    if (!lastSale) return false;

    const returnedSince = await prisma.inventoryMovement.findFirst({
        where: {
            referenceType: "ORDER",
            referenceUuid: orderUuid,
            type: "RETURN",
            createdAt: { gte: lastSale.createdAt },
        },
        select: { uuid: true },
    });
    return !returnedSince;
}

// HELPER: Update StoreDailyMetrics.itemsSold + CategoryDailyMetrics
 
async function updateItemsSoldMetrics(
    orderUuid: string,
    tenantUuid: string,
    storeUuid: string
) {
    try {
        const orderItems = await prisma.orderItem.findMany({
            where: { orderUuid },
            select: {
                productUuid: true,
                quantity: true,
                product: { select: { categoryUuid: true } },
            },
        });
    
        const totalItemsSold = orderItems.reduce((sum, i) => sum + i.quantity, 0);
        const today = dayjs().startOf("day").toDate();
    
        await prisma.storeDailyMetrics.upsert({
            where: {
                tenantUuid_storeUuid_date: { tenantUuid, storeUuid, date: today },
            },
            update: {
                itemsSold: { increment: totalItemsSold },
            },
            create: {
                tenantUuid,
                storeUuid,
                date: today,
                itemsSold: totalItemsSold,
                avgPrepTimeMin: 0,
                avgWaitTimeMin: 0,
            },
        });
    
        // Recalculate avgItemsPerOrder
        const metrics = await prisma.storeDailyMetrics.findUnique({
            where: {
                tenantUuid_storeUuid_date: { tenantUuid, storeUuid, date: today },
            },
            select: { itemsSold: true, ordersCompleted: true },
        });
    
        if (metrics && metrics.ordersCompleted > 0) {
            await prisma.storeDailyMetrics.update({
                where: {
                    tenantUuid_storeUuid_date: { tenantUuid, storeUuid, date: today },
                },
                data: {
                    avgItemsPerOrder: metrics.itemsSold / metrics.ordersCompleted,
                },
            });
        }
    
        const byCategory = new Map<string, number>();
        for (const item of orderItems) {
            if (item.product?.categoryUuid) {
                byCategory.set(
                    item.product.categoryUuid,
                    (byCategory.get(item.product.categoryUuid) ?? 0) + item.quantity
                );
            }
        }
    
        for (const [categoryUuid, qty] of byCategory) {
        // Composite key order matches schema: @@unique([tenantUuid, categoryUuid, storeUuid, date])
            await prisma.categoryDailyMetrics.upsert({
                where: {
                    tenantUuid_categoryUuid_storeUuid_date: {
                        tenantUuid,
                        categoryUuid,
                        storeUuid,
                        date: today,
                    },
                },
                update: {
                    itemsSold: { increment: qty },
                },
                create: {
                    tenantUuid,
                    storeUuid,
                    categoryUuid,
                    date: today,
                    itemsSold: qty,
                },
            });
        }
    } catch (error: any) {
        // Metrics update failure should never block the main flow
        logWithContext("error", "[InventoryHandler] itemsSold metrics update failed", {
            orderUuid,
            error: error.message,
        });
    }
}
 
// Reverse itemsSold on void/full refund
async function reverseItemsSoldMetrics(
    orderUuid: string,
    tenantUuid: string,
    storeUuid: string
) {
    try {
        const orderItems = await prisma.orderItem.findMany({
            where: { orderUuid },
            select: {
                quantity: true,
                product: { select: { categoryUuid: true } },
            },
        });
    
        const totalItems = orderItems.reduce((sum, i) => sum + i.quantity, 0);
        const today = dayjs().startOf("day").toDate();
    
        await prisma.storeDailyMetrics.updateMany({
            where: { tenantUuid, storeUuid, date: today },
            data: { itemsSold: { decrement: totalItems } },
        });
    
        const byCategory = new Map<string, number>();
        for (const item of orderItems) {
            if (item.product?.categoryUuid) {
                byCategory.set(
                    item.product.categoryUuid,
                    (byCategory.get(item.product.categoryUuid) ?? 0) + item.quantity
                );
            }
        }
    
        for (const [categoryUuid, qty] of byCategory) {
            await prisma.categoryDailyMetrics.updateMany({
                where: { tenantUuid, storeUuid, categoryUuid, date: today },
                data: { itemsSold: { decrement: qty } },
            });
        }
    } catch (error: any) {
        logWithContext("error", "[InventoryHandler] reverseItemsSold failed", {
            orderUuid,
            error: error.message,
        });
    }
}