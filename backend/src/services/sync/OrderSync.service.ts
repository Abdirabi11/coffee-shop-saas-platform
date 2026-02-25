import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";
import { InventoryService } from "../inventory/inventory.service.ts";

interface SyncPayload {
    clientOrderUuid: string; // Generated on mobile
    tenantUuid: string;
    storeUuid: string;
    tenantUserUuid: string;
    orderType: string;
    items: any[];
    totalAmount: number;
    status: string;
    createdAt: string; // Client timestamp
    lastModifiedAt: string;
    syncVersion: number;
}
  
export class OrderSyncService{
    //Sync order from mobile app (offline → online)
    static async syncFromClient(input: {
        tenantUuid: string;
        clientOrder: SyncPayload;
        deviceId: string;
    }){
        logWithContext("info", "[OrderSync] Syncing order from client", {
            clientOrderUuid: input.clientOrder.clientOrderUuid,
            deviceId: input.deviceId,
        });

        try {
            // Check if order already synced
            const existing = await prisma.order.findFirst({
                where: {
                    tenantUuid: input.tenantUuid,
                    clientOrderUuid: input.clientOrder.clientOrderUuid,
                },
            });

            if (existing) {
                // Order exists - check for conflicts
                return this.handleConflict({
                    serverOrder: existing,
                    clientOrder: input.clientOrder,
                });
            };

            // Create new order from client data
            const order = await prisma.order.create({
                data: {
                    uuid: input.clientOrder.clientOrderUuid, // Use client UUID
                    tenantUuid: input.clientOrder.tenantUuid,
                    storeUuid: input.clientOrder.storeUuid,
                    tenantUserUuid: input.clientOrder.tenantUserUuid,
                    orderNumber: await this.generateOrderNumber(
                        input.clientOrder.tenantUuid,
                        input.clientOrder.storeUuid
                    ),
                    orderType: input.clientOrder.orderType,
                    status: input.clientOrder.status,
                    paymentStatus: "PENDING",
                    fulfillmentStatus: "PENDING",
                    totalAmount: input.clientOrder.totalAmount,
                    currency: "USD",
                    // ... other fields
                    syncVersion: 1,
                    lastSyncedAt: new Date(),
                    syncSource: "CLIENT",
                    deviceId: input.deviceId,
                },
            });

            // Create order items
            await prisma.orderItem.createMany({
                data: input.clientOrder.items.map((item: any) => ({
                    tenantUuid: input.clientOrder.tenantUuid,
                    orderUuid: order.uuid,
                    productUuid: item.productUuid,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    finalPrice: item.finalPrice,
                    // ... other fields
                })),
            });

            // Reserve inventory
            await InventoryService.reserveStock({
                tenantUuid: input.tenantUuid,
                storeUuid: input.clientOrder.storeUuid,
                orderUuid: order.uuid,
                items: input.clientOrder.items.map((i: any) => ({
                    productUuid: i.productUuid,
                    quantity: i.quantity,
                })),
            });

            logWithContext("info", "[OrderSync] Order synced successfully", {
                orderUuid: order.uuid,
            });

            MetricsService.increment("order.sync.success", 1);

            return {
                success: true,
                serverOrderUuid: order.uuid,
                syncVersion: 1,
            };
        } catch (error: any) {
            logWithContext("error", "[OrderSync] Failed to sync order", {
                error: error.message,
                clientOrderUuid: input.clientOrder.clientOrderUuid,
            });
        
            MetricsService.increment("order.sync.failed", 1);
        
            return {
                success: false,
                error: error.message,
                requiresManualReview: true,
            };
        }
    }

    //Handle sync conflicts
    private static async handleConflict(input: {
        serverOrder: any;
        clientOrder: SyncPayload;
    }) {
        logWithContext("warn", "[OrderSync] Sync conflict detected", {
            serverOrderUuid: input.serverOrder.uuid,
            clientOrderUuid: input.clientOrder.clientOrderUuid,
        });
    
        // Conflict resolution strategy: Last-write-wins with version check
        const clientTimestamp = new Date(input.clientOrder.lastModifiedAt);
        const serverTimestamp = input.serverOrder.updatedAt;
    
        if (clientTimestamp > serverTimestamp) {
            // Client version is newer - update server
            logWithContext("info", "[OrderSync] Client version is newer - updating server");
    
            await prisma.order.update({
                where: { uuid: input.serverOrder.uuid },
                data: {
                    status: input.clientOrder.status,
                    syncVersion: { increment: 1 },
                    lastSyncedAt: new Date(),
                },
            });
    
            return {
                success: true,
                conflictResolved: true,
                resolution: "CLIENT_WINS",
            };
        } else {
            // Server version is newer or equal - keep server
            logWithContext("info", "[OrderSync] Server version is newer - keeping server");
    
            return {
                success: true,
                conflictResolved: true,
                resolution: "SERVER_WINS",
                serverOrder: input.serverOrder,
            };
        }
    }

    //Get pending changes for client
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
                deviceId: { not: input.deviceId }, // Exclude changes from same device
            },
            include: {
                items: true,
            },
            orderBy: { updatedAt: "asc" },
            take: 50, // Batch size
        });
      
        return {
            changes,
            lastSyncTimestamp: new Date(),
            hasMore: changes.length === 50,
        };
    }
    
    private static async generateOrderNumber(
        tenantUuid: string,
        storeUuid: string
    ) {
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