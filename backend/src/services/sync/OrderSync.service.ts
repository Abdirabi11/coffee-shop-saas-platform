import { OrderStatus, OrderType, Prisma } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { InventoryOrderService } from "../inventory/InventoryOrder.service.ts";
import { MenuService } from "../menu/menu.service.ts";
import { MenuSnapshotService } from "../menu/menuSnapshot.service.ts";
import { OrderNumberService } from "../order/OrderNumber.service.ts";
import { OrderPricingService } from "../order/OrderPricing.service.ts";
import { OrderStatusService } from "../order/OrderStatus.service.ts";

const MAX_SYNC_ITEMS = 100;

export interface SyncOrderItem {
    productUuid: string;
    quantity: number;
    specialInstructions?: string;
    modifiers?: { optionUuid: string; quantity?: number }[];
    // Any client price fields (unitPrice, finalPrice, ...) are ignored.
}

// Client-supplied order data. Ownership fields (tenantUuid, tenantUserUuid)
// are deliberately absent: they come from the authenticated request context.
// storeUuid is a claim that is verified against the tenant before use.
// Prices are never taken from here; totalAmount is only compared against the
// server price to flag drift.
export interface SyncPayload {
    clientOrderUuid: string; // Generated on mobile; doubles as the idempotency key
    storeUuid: string;
    orderType: string;
    items: SyncOrderItem[];
    totalAmount?: number;
    status: string;
    createdAt: string; // Client timestamp
    lastModifiedAt: string;
    tableNumber?: string;
    customerNotes?: string;
}

export interface OrderSyncResult {
    success: boolean;
    serverOrderUuid?: string;
    orderNumber?: string;
    totalAmount?: number;
    priceAdjusted?: boolean;
    replayed?: boolean;
    conflictResolved?: boolean;
    resolution?: "CLIENT_WINS" | "SERVER_WINS";
    serverOrder?: unknown;
    error?: string;
    requiresManualReview?: boolean;
}

// Status changes a device may push. PAID is excluded: payment state only
// comes from the payment flow, never from a client claim.
const CLIENT_SETTABLE_STATUSES = new Set<OrderStatus>([
    OrderStatus.PREPARING,
    OrderStatus.READY,
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
]);

export class OrderSyncService{
    //Sync order from mobile app (offline → online)
    //
    // Idempotent on clientOrderUuid: the order is created with that uuid as its
    // primary key inside one transaction (order + items + inventory). A retry
    // either finds the committed order or loses the insert race on the primary
    // key, and in both cases returns the existing order without re-reserving
    // inventory.
    static async syncFromClient(input: {
        tenantUuid: string;      // req.tenant.uuid
        tenantUserUuid: string;  // req.tenantUser.uuid
        userUuid: string;        // req.user.userUuid
        clientOrder: SyncPayload;
        deviceId: string;
        // CREATE retries always replay; only UPDATE may change status
        operation?: string;
    }): Promise<OrderSyncResult> {
        const clientOrderUuid = input.clientOrder.clientOrderUuid;

        logWithContext("info", "[OrderSync] Syncing order from client", {
            clientOrderUuid,
            deviceId: input.deviceId,
        });

        // Throws STORE_ACCESS_DENIED; deliberately outside the try below so
        // it isn't converted into a "requires manual review" result.
        const storeUuid = await this.assertStoreAccess({
            tenantUuid: input.tenantUuid,
            userUuid: input.userUuid,
            storeUuid: input.clientOrder.storeUuid,
        });

        try {
            // TODO(schema): add Order.clientOrderUuid (@@unique with tenantUuid)
            // so the client id isn't reused as the global primary key.
            const existing = await this.findOrder(input.tenantUuid, clientOrderUuid);

            if (existing) {
                if (input.operation !== "UPDATE") {
                    MetricsService.increment("order.sync.replayed", 1);
                    return this.replayResult(existing);
                }

                return this.handleExisting({
                    tenantUuid: input.tenantUuid,
                    userUuid: input.userUuid,
                    serverOrder: existing,
                    clientOrder: input.clientOrder,
                });
            };

            return await this.createOrder({ ...input, storeUuid });
        } catch (error: any) {
            // Lost the insert race against a concurrent retry of the same
            // order: the other request committed it, so this is a replay.
            if (this.isUniqueViolation(error)) {
                const winner = await this.findOrder(input.tenantUuid, clientOrderUuid);
                if (winner) {
                    MetricsService.increment("order.sync.replayed", 1);
                    return this.replayResult(winner);
                }

                // uuid is taken by a row outside this tenant
                logWithContext("warn", "[OrderSync] clientOrderUuid collision", {
                    clientOrderUuid,
                });
                return {
                    success: false,
                    error: "CLIENT_ORDER_UUID_CONFLICT",
                    requiresManualReview: true,
                };
            }

            logWithContext("error", "[OrderSync] Failed to sync order", {
                error: error.message,
                clientOrderUuid,
            });

            MetricsService.increment("order.sync.failed", 1);

            return {
                success: false,
                error: error.message,
                requiresManualReview: true,
            };
        }
    }

    private static async createOrder(input: {
        tenantUuid: string;
        tenantUserUuid: string;
        storeUuid: string;
        clientOrder: SyncPayload;
        deviceId: string;
    }): Promise<OrderSyncResult> {
        const { tenantUuid, storeUuid, clientOrder } = input;
        const items = this.validateItems(clientOrder.items);

        const orderType = Object.values(OrderType).includes(clientOrder.orderType as OrderType)
            ? (clientOrder.orderType as OrderType)
            : OrderType.DINE_IN;

        // Price from the server's menu. Client prices are ignored entirely.
        const menu = await MenuService.getStoreMenu({ tenantUuid, storeUuid });
        const menuSnapshot = await MenuSnapshotService.getCurrentSnapshot(storeUuid);
        const pricing = await OrderPricingService.resolveItems(tenantUuid, storeUuid, menu, items);

        if (pricing.items.length === 0) {
            throw new Error("ORDER_EMPTY");
        }

        // Order + items + inventory commit or roll back together
        const order = await prisma.$transaction(async (tx) => {
            const orderNumber = await OrderNumberService.next(tx, tenantUuid);

            const order = await tx.order.create({
                data: {
                    uuid: clientOrder.clientOrderUuid,
                    tenantUuid,
                    storeUuid,
                    tenantUserUuid: input.tenantUserUuid,
                    orderNumber,
                    orderType,
                    tableNumber: typeof clientOrder.tableNumber === "string" ? clientOrder.tableNumber : undefined,
                    customerNotes: typeof clientOrder.customerNotes === "string" ? clientOrder.customerNotes : undefined,
                    // New orders always start PENDING; PAID comes from the
                    // payment flow, later states from OrderStatusService.
                    status: OrderStatus.PENDING,
                    paymentStatus: "PENDING",
                    fulfillmentStatus: "PENDING",
                    currency: "USD",
                    subtotal: pricing.subtotal,
                    taxAmount: pricing.taxAmount,
                    discountAmount: pricing.discountAmount,
                    serviceCharge: pricing.serviceCharge,
                    totalAmount: pricing.totalAmount,
                    appliedPromos: pricing.appliedPromos,
                    taxBreakdown: pricing.taxBreakdown,
                    menuSnapshotUuid: menuSnapshot?.uuid,
                    menuVersion: menuSnapshot?.version ?? 1,
                    pricingSnapshot: {
                        source: "OFFLINE_SYNC",
                        deviceId: input.deviceId ?? null,
                        clientCreatedAt: clientOrder.createdAt ?? null,
                        clientTotalAmount: clientOrder.totalAmount ?? null,
                        items: pricing.items,
                        calculations: {
                            subtotal: pricing.subtotal,
                            tax: pricing.taxAmount,
                            discount: pricing.discountAmount,
                            serviceCharge: pricing.serviceCharge,
                            total: pricing.totalAmount,
                        },
                    },
                    // TODO(schema): syncVersion, lastSyncedAt, syncSource and
                    // deviceId columns don't exist on Order yet; deviceId and
                    // client timestamps are kept in pricingSnapshot for now.
                },
            });

            await tx.orderItem.createMany({
                data: pricing.items.map((item) => ({
                    tenantUuid,
                    orderUuid: order.uuid,
                    productUuid: item.productUuid,
                    productName: item.productName,
                    categoryName: item.categoryName,
                    quantity: item.quantity,
                    basePrice: item.basePrice,
                    optionsCost: item.optionsCost,
                    unitPrice: item.unitPrice,
                    subtotal: item.subtotal,
                    discountAmount: item.discountAmount,
                    finalPrice: item.finalPrice,
                    taxAmount: item.taxAmount,
                    selectedOptions: item.selectedOptions,
                    specialInstructions: items.find(
                        (i) => i.productUuid === item.productUuid
                    )?.specialInstructions,
                    status: "PENDING",
                })),
            });

            await InventoryOrderService.reserveForOrder({
                tenantUuid,
                storeUuid,
                orderUuid: order.uuid,
                items: pricing.items.map((i) => ({
                    productUuid: i.productUuid,
                    quantity: i.quantity,
                })),
                tx,
            });

            return order;
        });

        const priceAdjusted =
            typeof clientOrder.totalAmount === "number" &&
            clientOrder.totalAmount !== pricing.totalAmount;

        if (priceAdjusted) {
            logWithContext("warn", "[OrderSync] Client total differs from server price", {
                orderUuid: order.uuid,
                clientTotal: clientOrder.totalAmount,
                serverTotal: pricing.totalAmount,
            });
            MetricsService.increment("order.sync.price_adjusted", 1);
        }

        logWithContext("info", "[OrderSync] Order synced successfully", {
            orderUuid: order.uuid,
            orderNumber: order.orderNumber,
        });

        MetricsService.increment("order.sync.success", 1);

        return {
            success: true,
            serverOrderUuid: order.uuid,
            orderNumber: order.orderNumber,
            totalAmount: order.totalAmount,
            priceAdjusted,
        };
    }

    //Handle a sync for an order the server already has
    //
    // A retry of the original create carries the same status the order was
    // created with, so it is a no-op replay. A genuine status change is
    // applied only through OrderStatusService, which enforces the state
    // machine; anything it rejects resolves to the server's state.
    private static async handleExisting(input: {
        tenantUuid: string;
        userUuid: string;
        serverOrder: Prisma.OrderGetPayload<{}>;
        clientOrder: SyncPayload;
    }): Promise<OrderSyncResult> {
        const { serverOrder, clientOrder } = input;
        const requested = clientOrder.status as OrderStatus;

        if (requested === serverOrder.status || !CLIENT_SETTABLE_STATUSES.has(requested)) {
            MetricsService.increment("order.sync.replayed", 1);
            return this.replayResult(serverOrder);
        }

        // Last-write-wins on the client's claimed modification time
        const clientTimestamp = new Date(clientOrder.lastModifiedAt);
        if (!(clientTimestamp > serverOrder.updatedAt)) {
            logWithContext("info", "[OrderSync] Server version is newer - keeping server", {
                orderUuid: serverOrder.uuid,
            });
            return this.serverWins(serverOrder);
        }

        try {
            await OrderStatusService.transition(serverOrder.uuid, requested, {
                changedBy: input.userUuid,
                reason: "OFFLINE_SYNC",
            });
        } catch (error: any) {
            logWithContext("warn", "[OrderSync] Client status change rejected", {
                orderUuid: serverOrder.uuid,
                from: serverOrder.status,
                to: requested,
                error: error.message,
            });
            return this.serverWins((await this.findOrder(input.tenantUuid, serverOrder.uuid)) ?? serverOrder);
        }

        logWithContext("info", "[OrderSync] Client status change applied", {
            orderUuid: serverOrder.uuid,
            from: serverOrder.status,
            to: requested,
        });

        return {
            success: true,
            serverOrderUuid: serverOrder.uuid,
            orderNumber: serverOrder.orderNumber,
            conflictResolved: true,
            resolution: "CLIENT_WINS",
        };
    }

    private static replayResult(order: Prisma.OrderGetPayload<{}>): OrderSyncResult {
        return {
            success: true,
            replayed: true,
            serverOrderUuid: order.uuid,
            orderNumber: order.orderNumber,
            totalAmount: order.totalAmount,
        };
    }

    private static serverWins(order: Prisma.OrderGetPayload<{}>): OrderSyncResult {
        return {
            success: true,
            serverOrderUuid: order.uuid,
            orderNumber: order.orderNumber,
            conflictResolved: true,
            resolution: "SERVER_WINS",
            serverOrder: order,
        };
    }

    private static findOrder(tenantUuid: string, orderUuid: string) {
        return prisma.order.findFirst({
            where: { tenantUuid, uuid: orderUuid },
        });
    }

    private static isUniqueViolation(error: unknown): boolean {
        return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    }

    private static validateItems(items: unknown): SyncOrderItem[] {
        if (!Array.isArray(items) || items.length === 0) {
            throw new Error("ORDER_EMPTY");
        }
        if (items.length > MAX_SYNC_ITEMS) {
            throw new Error("TOO_MANY_ITEMS");
        }

        return items.map((item: any) => {
            if (typeof item?.productUuid !== "string" || !Number.isInteger(item.quantity) || item.quantity <= 0) {
                throw new Error("INVALID_ORDER_ITEM");
            }
            return {
                productUuid: item.productUuid,
                quantity: item.quantity,
                specialInstructions: typeof item.specialInstructions === "string"
                    ? item.specialInstructions
                    : undefined,
                modifiers: Array.isArray(item.modifiers)
                    ? item.modifiers.map((m: any) => ({
                        optionUuid: String(m?.optionUuid),
                        quantity: Number.isInteger(m?.quantity) && m.quantity > 0 ? m.quantity : 1,
                    }))
                    : undefined,
            };
        });
    }

    //Get pending changes for client
    // Superseded by SyncController.pullChanges (cursor-based).
    static async getPendingChanges(input: {
        tenantUuid: string;
        storeUuid: string;
        lastSyncTimestamp: Date;
        deviceId: string;
    }) {
        const changes = await prisma.order.findMany({
            where: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                updatedAt: { gt: input.lastSyncTimestamp },
                // TODO(schema): Order has no deviceId column, so changes from
                // the requesting device can't be excluded yet.
            },
            include: {
                items: true,
            },
            orderBy: [{ updatedAt: "asc" }, { uuid: "asc" }],
            take: 50, // Batch size
        });

        return {
            changes,
            lastSyncTimestamp: new Date(),
            hasMore: changes.length === 50,
        };
    }

    // The store must belong to the authenticated tenant and the user must be
    // actively assigned to it. Returns the verified storeUuid.
    private static async assertStoreAccess(input: {
        tenantUuid: string;
        userUuid: string;
        storeUuid: string;
    }): Promise<string> {
        if (!input.storeUuid) {
            throw new Error("STORE_ACCESS_DENIED");
        }

        const membership = await prisma.userStore.findFirst({
            where: {
                userUuid: input.userUuid,
                storeUuid: input.storeUuid,
                tenantUuid: input.tenantUuid,
                isActive: true,
            },
            select: { storeUuid: true },
        });

        if (!membership) {
            throw new Error("STORE_ACCESS_DENIED");
        }

        return membership.storeUuid;
    }
}
