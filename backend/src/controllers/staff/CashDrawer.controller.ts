import { Request, Response } from "express";
import { CashDrawerService } from "../../services/staff/CashDrawer.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";


export class CashDrawerController {
  
    //POST /api/cash/open
    static async openDrawer(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { storeUuid, userUuid, startingCash, drawerNumber } = req.body;

            const drawer = await CashDrawerService.openDrawer({
                tenantUuid,
                storeUuid,
                userUuid,
                startingCash,
                drawerNumber,
                openedBy: req.user!.uuid,
            });

            return res.status(201).json({
                success: true,
                drawer,
            });

        } catch (error: any) {
            logWithContext("error", "[CashDrawer] Open drawer failed", {
                error: error.message,
            });

            if (error.message === "DRAWER_ALREADY_OPEN") {
                return res.status(409).json({
                error: "DRAWER_ALREADY_OPEN",
                message: "Cash drawer is already open",
                });
            }

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/cash/:drawerUuid/close
    static async closeDrawer(req: Request, res: Response) {
        try {
            const { drawerUuid } = req.params;
            const { actualCash, cashCount, notes } = req.body;

            const result = await CashDrawerService.closeDrawer({
                drawerUuid,
                actualCash,
                closedBy: req.user!.uuid,
                cashCount,
                notes,
            });

            return res.status(200).json({
                success: true,
                drawer: result.drawer,
                expectedCash: result.expectedCash,
                actualCash: result.actualCash,
                variance: result.variance,
                requiresApproval: result.requiresApproval,
            });

        } catch (error: any) {
            logWithContext("error", "[CashDrawer] Close drawer failed", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/cash/:drawerUuid/drop
    static async cashDrop(req: Request, res: Response) {
        try {
            const { drawerUuid } = req.params;
            const { storeUuid, amount, reason } = req.body;

            const cashDrop = await CashDrawerService.createCashDrop({
                drawerUuid,
                storeUuid,
                amount,
                droppedBy: req.user!.uuid,
                reason,
            });
    
            return res.status(201).json({
                success: true,
                cashDrop,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/cash-drawer/drop/:cashDropUuid/verify
    static async verifyCashDrop(req: Request, res: Response) {
        try {
            const { cashDropUuid } = req.params;

            const cashDrop = await CashDrawerService.verifyCashDrop({
                cashDropUuid,
                verifiedBy: req.user!.uuid,
            });

            return res.status(200).json({
                success: true,
                cashDrop,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //GET /api/cash-drawer/active
    static async getActiveDrawer(req: Request, res: Response) {
        try {
            const userUuid = req.user!.uuid;
            const { storeUuid } = req.query;

            if (!storeUuid) {
                return res.status(400).json({
                error: "VALIDATION_ERROR",
                message: "storeUuid is required",
                });
            }

            const drawer = await CashDrawerService.getActiveDrawer({
                userUuid,
                storeUuid: storeUuid as string,
            });

            return res.status(200).json({
                success: true,
                drawer,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //GET /api/cash-drawer/history/:storeUuid
    static async getDrawerHistory(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const { userUuid, dateFrom, dateTo, page, limit } = req.query;

            const result = await CashDrawerService.getDrawerHistory({
                storeUuid,
                userUuid: userUuid as string,
                dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
                dateTo: dateTo ? new Date(dateTo as string) : undefined,
                page: page ? parseInt(page as string) : undefined,
                limit: limit ? parseInt(limit as string) : undefined,
            });

            return res.status(200).json({
                success: true,
                ...result,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }
}