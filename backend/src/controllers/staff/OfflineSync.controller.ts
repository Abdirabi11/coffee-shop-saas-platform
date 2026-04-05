import { Request, Response } from "express";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { OfflineSyncService } from "../../services/staff/OfflineSync.service.ts";


export class OfflineSyncController {
  
    //GET /api/offline/sync-package
    static async getSyncPackage(req: Request, res: Response) {
        try {
            const userUuid = req.user!.uuid;
            const { storeUuid } = req.query;

            if (!storeUuid) {
                return res.status(400).json({
                error: "VALIDATION_ERROR",
                message: "storeUuid is required",
                });
            }

            const packageData = await OfflineSyncService.prepareOfflinePackage({
                userUuid,
                storeUuid: storeUuid as string,
            });

            return res.status(200).json({
                success: true,
                data: packageData,
            });

        } catch (error: any) {
            logWithContext("error", "[OfflineSync] Failed to prepare package", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/offline/sync
    static async syncActions(req: Request, res: Response) {
        try {
            const userUuid = req.user!.uuid;
            const { storeUuid, actions } = req.body;

            if (!storeUuid || !actions || !Array.isArray(actions)) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "storeUuid and actions array are required",
                });
            }

            const results = await OfflineSyncService.syncOfflineActions({
                userUuid,
                storeUuid,
                actions,
            });

            return res.status(200).json({
                success: true,
                results,
            });

        } catch (error: any) {
            logWithContext("error", "[OfflineSync] Sync failed", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }
}