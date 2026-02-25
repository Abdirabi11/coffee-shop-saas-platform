import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma.ts"
import { logWithContext } from "../infrastructure/observability/logger.ts";

export const syncConflictDetection = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    // Only check for sync endpoints
    if (!req.path.includes("/sync/")) {
      return next();
    }
  
    try {
        const { clientOrderUuid, syncVersion, lastModifiedAt } = req.body;
    
        if (!clientOrderUuid) {
            return next();
        }
    
        // Check if order exists on server
        const serverOrder = await prisma.order.findFirst({
            where: {
                uuid: clientOrderUuid,
                tenantUuid: req.tenant!.uuid,
            },
        });
  
        if (!serverOrder) {
            // New order - no conflict
            return next();
        }
    
        // Check for version conflict
        const clientVersion = syncVersion || 0;
        const serverVersion = serverOrder.syncVersion || 0;
  
        if (clientVersion !== serverVersion) {
            logWithContext("warn", "[Sync] Version conflict detected", {
                clientOrderUuid,
                clientVersion,
                serverVersion,
            });
  
            // Store conflict for resolution
            await prisma.syncConflict.create({
                data: {
                    tenantUuid: req.tenant!.uuid,
                    entityType: "ORDER",
                    entityUuid: clientOrderUuid,
                    clientVersion,
                    serverVersion,
                    clientData: req.body,
                    serverData: serverOrder,
                    resolution: "PENDING",
                },
            });
  
            return res.status(409).json({
                error: "SYNC_CONFLICT",
                message: "Version conflict detected",
                conflict: {
                    clientVersion,
                    serverVersion,
                    serverData: serverOrder,
                },
            });
        };
  
        // Check timestamp conflict
        if (lastModifiedAt) {
            const clientTime = new Date(lastModifiedAt);
            const serverTime = serverOrder.updatedAt;
    
            if (Math.abs(clientTime.getTime() - serverTime.getTime()) > 5000) {
                // More than 5 seconds difference
                logWithContext("warn", "[Sync] Timestamp conflict detected", {
                    clientOrderUuid,
                    clientTime,
                    serverTime,
                });
            }
        };
  
        next();
    } catch (error: any) {
        logWithContext("error", "[Sync] Conflict detection failed", {
            error: error.message,
        });
    
        next();
    }
};
  