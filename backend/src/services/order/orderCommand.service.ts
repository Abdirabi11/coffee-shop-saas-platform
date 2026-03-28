import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";
import { InventoryOrderService } from "../inventory/InventoryOrder.service.ts";
import { MenuService } from "../menu/menu.service.ts";
import { MenuSnapshotService } from "../menu/menuSnapshot.service.ts";
import { StoreHoursService } from "../store/storeHours.service.ts";
import { IdempotencyService } from "./idempotency.service.ts";
import { OrderPricingService } from "./orderPricing.service.ts";

interface CreateOrderItemInput {
  productUuid: string;
  quantity: number;
  specialInstructions?: string;
  modifiers?: {
    optionUuid: string;
    quantity?: number;
  }[];
}
 
interface CreateOrderInput {
  tenantUuid: string;
  storeUuid: string;
  tenantUserUuid: string;
  orderType: string;
  tableNumber?: string;
  deliveryAddress?: any;
  customerNotes?: string;
  promoCode?: string;
  items: CreateOrderItemInput[];
  idempotencyKey?: string;
}
 
export class OrderCommandService {
 
    static async createOrder(input: CreateOrderInput) {
        const {
            tenantUuid,
            storeUuid,
            tenantUserUuid,
            orderType,
            items,
            idempotencyKey,
        } = input;
    
        if (idempotencyKey) {
            const existing = await IdempotencyService.check(
                tenantUuid,
                idempotencyKey,
                "POST /orders"
            );
            if (existing) {
                return JSON.parse(existing.response);
            }
        }
    
        const isOpen = await StoreHoursService.isStoreOpen(storeUuid);
        if (!isOpen) {
            throw new Error("STORE_CLOSED");
        };
    
        const order = await prisma.$transaction(async (tx) => {
    
            const tenantUser = await tx.tenantUser.findUnique({
                where: { uuid: tenantUserUuid },
                include: { user: true },
            });
            if (!tenantUser) throw new Error("USER_NOT_FOUND");
        
            const menu = await MenuService.getStoreMenu({
                tenantUuid,
                storeUuid,
                userUuid: tenantUser.user.uuid,
            });
        
            // Get menu snapshot for price dispute protection
            const menuSnapshot = await MenuSnapshotService.getCurrentSnapshot(storeUuid);
        
            const pricing = await OrderPricingService.resolveItems(
                tenantUuid,
                storeUuid,
                menu,
                items,
                {
                    promoCode: input.promoCode,
                    userTier: tenantUser.role,
                }
            );
        
            if (pricing.items.length === 0) {
                throw new Error("ORDER_EMPTY");
            }
    
            // Generate order number: ORD-20260328-0001
            const orderNumber = await this.generateOrderNumber(tenantUuid, storeUuid);
        
            // Create order
            const order = await tx.order.create({
                data: {
                    tenantUuid,
                    storeUuid,
                    tenantUserUuid,
                    orderNumber,
                    orderType,
                    tableNumber: input.tableNumber,
                    deliveryAddress: input.deliveryAddress,
                    customerName: tenantUser.displayName ?? tenantUser.user.name,
                    customerPhone: tenantUser.user.phoneNumber,
                    customerNotes: input.customerNotes,
                    status: "PENDING",
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
                        items: pricing.items,
                        calculations: {
                            subtotal: pricing.subtotal,
                            tax: pricing.taxAmount,
                            discount: pricing.discountAmount,
                            serviceCharge: pricing.serviceCharge,
                            total: pricing.totalAmount,
                        },
                    },
                },
            });
        
            // Create order items
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
        
            // Reserve inventory (availableStock↓, reservedStock↑)
            await InventoryOrderService.reserveForOrder({
                orderUuid: order.uuid,
                storeUuid,
                items: pricing.items.map((i) => ({
                    productUuid: i.productUuid,
                    quantity: i.quantity,
                })),
            });
        
            return order;
        });
    
        //Post-transaction: idempotency + event
        if (idempotencyKey) {
            await IdempotencyService.store(
                tenantUuid,
                idempotencyKey,
                "POST /orders",
                JSON.stringify(order),
                201
            );
        }
    
        EventBus.emit("ORDER_CREATED", {
            orderUuid: order.uuid,
            tenantUuid: order.tenantUuid,
            storeUuid: order.storeUuid,
            totalAmount: order.totalAmount,
        });
    
        logWithContext("info", "[Order] Created", {
            orderUuid: order.uuid,
            orderNumber: order.orderNumber,
            totalAmount: order.totalAmount,
        });
    
        MetricsService.increment("order.created", 1);
    
        return order;
    }
 
    // ── Order number generator ───────────────────────────────────────────────
    // Format: ORD-20260328-0001 (date + daily sequence per store)
 
    private static async generateOrderNumber(
        tenantUuid: string,
        storeUuid: string
    ): Promise<string> {
        const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
        const count = await prisma.order.count({
            where: {
                tenantUuid,
                storeUuid,
                createdAt: {
                    gte: new Date(new Date().setHours(0, 0, 0, 0)),
                },
            },
        });
        return `ORD-${today}-${String(count + 1).padStart(4, "0")}`;
    }
}