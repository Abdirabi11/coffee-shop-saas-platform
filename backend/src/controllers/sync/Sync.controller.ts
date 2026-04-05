import { Request, Response } from "express";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { OrderSyncService } from "../../services/sync/OrderSync.service.ts";

export class SyncController {
    //POST /api/sync/orders
    //Sync order from client
    static async syncOrder(req: Request, res: Response){
        const traceId = req.headers["x-trace-id"] as string || `sync_${Date.now()}`;

        try {
            const tenantUuid = req.tenant!.uuid;
            const tenantUserUuid = req.user!.tenantUserUuid;
            const { operation, clientOrderUuid, data, syncVersion } = req.body;
            
            logWithContext("info", "[Sync] Order sync request", {
                traceId,
                operation,
                clientOrderUuid,
                syncVersion,
            });
            
            // Sync order
            const result = await OrderSyncService.sync({
                tenantUuid,
                tenantUserUuid,
                operation,
                clientOrderUuid,
                clientData: data,
                clientSyncVersion: syncVersion,
                deviceId: req.headers["x-device-id"] as string,
            });
      
            if (result.conflict) {
                // Conflict detected
                logWithContext("warn", "[Sync] Order sync conflict", {
                    traceId,
                    clientOrderUuid,
                    resolution: result.resolution,
                });
                
                return res.status(409).json({
                    conflict: true,
                    resolution: result.resolution,
                    serverData: result.serverData,
                    clientData: data,
                    message: "Conflict detected - review required",
                });
            }
      
            logWithContext("info", "[Sync] Order synced successfully", {
                traceId,
                serverOrderUuid: result.serverOrderUuid,
            });
            
            MetricsService.increment("sync.order.success", 1, {
                operation,
            });
      
            return res.status(200).json({
                success: true,
                serverOrderUuid: result.serverOrderUuid,
                orderNumber: result.orderNumber,
                syncVersion: result.syncVersion,
                serverTimestamp: result.serverTimestamp,
            });
        } catch (error: any) {
            logWithContext("error", "[Sync] Order sync failed", {
                traceId,
                error: error.message,
            });
              
            MetricsService.increment("sync.order.failed", 1);
              
            return res.status(500).json({
                success: false,
                error: error.message,
                retryable: this.isRetryableError(error),
            });
        }
    }

    //POST /api/sync/payments
    //Sync payment from client
    static async syncPayment(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `sync_${Date.now()}`;

        try {
            const tenantUuid = req.tenant!.uuid;
            const { operation, clientPaymentUuid, data } = req.body;
            
            logWithContext("info", "[Sync] Payment sync request", {
                traceId,
                operation,
                clientPaymentUuid,
            });
            
            // Sync payment
            const result = await PaymentSyncService.sync({
                tenantUuid,
                operation,
                clientPaymentUuid,
                clientData: data,
            });
        } catch (error: any) {
            logWithContext("error", "[Sync] Payment sync failed", {
                traceId,
                error: error.message,
            });
              
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    //GET /api/sync/pull
    //Pull changes from server (delta sync)
    static async pullChanges(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `sync_${Date.now()}`;

        try {
            const tenantUuid = req.tenant!.uuid;
            const storeUuid = req.store!.uuid;
            const { lastSyncTimestamp, deviceId } = req.query;
            
            logWithContext("info", "[Sync] Pull changes request", {
                traceId,
                lastSyncTimestamp,
            });

            // Get changes since last sync
            const changes = await this.getChangesSince({
                tenantUuid,
                storeUuid,
                lastSyncTimestamp: new Date(parseInt(lastSyncTimestamp as string)),
                deviceId: deviceId as string,
            });
            
            return res.status(200).json({
                success: true,
                changes,
                serverTimestamp: Date.now(),
            });
      
        } catch (error: any) {
            logWithContext("error", "[Sync] Pull changes failed", {
                traceId,
                error: error.message,
            });
              
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    //Get changes since timestamp
    private static async getChangesSince(input: {
        tenantUuid: string;
        storeUuid: string;
        lastSyncTimestamp: Date;
        deviceId: string;
    }) {
        // Get orders changed since last sync
        const orders = await prisma.order.findMany({
            where: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                updatedAt: { gt: input.lastSyncTimestamp },
                deviceId: { not: input.deviceId }, // Exclude changes from same device
            },
            include: {
                items: true,
            },
            take: 50,
        });

        // Get products changed since last sync
        const products = await prisma.product.findMany({
            where: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                updatedAt: { gt: input.lastSyncTimestamp },
            },
            take: 100,
        });
        
        // Get payments changed since last sync
        const payments = await prisma.payment.findMany({
            where: {
                tenantUuid: input.tenantUuid,
                order: {
                    storeUuid: input.storeUuid,
                },
                updatedAt: { gt: input.lastSyncTimestamp },
            },
            take: 50,
        });

        return {
            orders,
            products,
            payments,
        };
    }

    //Check if error is retryable
    private static isRetryableError(error: any): boolean {
        const retryableErrors = [
            "NETWORK_ERROR",
            "TIMEOUT",
            "SERVER_OVERLOAD",
        ];
        
        return retryableErrors.some(e => error.message.includes(e));
    }
}