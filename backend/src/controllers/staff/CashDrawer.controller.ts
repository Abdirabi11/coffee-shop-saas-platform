import type { Request, Response } from "express";
import { CashDrawerService } from "../../services/staff/CashDrawer.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

// Roles that may act on someone else's drawer (close it, drop from it) and
// verify drops. Everyone else only acts on their own drawer.
const SUPERVISOR_ROLES = new Set([
    "SHIFT_SUPERVISOR", "MANAGER", "STORE_MANAGER", "ADMIN", "TENANT_ADMIN", "OWNER", "SUPER_ADMIN",
]);
const isSupervisor = (req: Request) => (req.access?.roles ?? []).some((r) => SUPERVISOR_ROLES.has(r));

const DRAWER_ERRORS: Record<string, number> = {
    INVALID_AMOUNT: 400,
    DRAWER_NOT_FOUND: 404,
    CASH_DROP_NOT_FOUND: 404,
    DRAWER_NOT_YOURS: 403,
    DROP_SELF_VERIFY: 403,
    NO_PERMISSION_OPEN_DRAWER: 403,
    DRAWER_NOT_OPEN: 409,
    DROP_ALREADY_VERIFIED: 409,
};

function drawerError(res: Response, error: any, fallback: string) {
    const status = DRAWER_ERRORS[error.message];
    if (status) return res.status(status).json({ error: error.message });
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: fallback });
}


export class CashDrawerController {
  
    //POST /api/cash/open
    static async openDrawer(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { startingCash, drawerNumber, terminalId } = req.body;

            // The caller's own drawer, at the store checkRole verified (a
            // body userUuid used to open drawers in other people's names)
            const drawer = await CashDrawerService.openDrawer({
                tenantUuid,
                storeUuid: req.store!.uuid,
                userUuid: req.user!.userUuid,
                startingCash,
                drawerNumber,
                terminalId,
                openedBy: req.user!.userUuid,
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

            return drawerError(res, error, "Failed to open drawer");
        }
    }

    //POST /api/cash/:drawerUuid/close
    static async closeDrawer(req: Request, res: Response) {
        try {
            const { drawerUuid } = req.params;
            const { actualCash, cashCount, notes } = req.body;

            const result = await CashDrawerService.closeDrawer({
                tenantUuid: req.tenant!.uuid,
                drawerUuid,
                actualCash,
                closedBy: req.user!.userUuid,
                actorIsSupervisor: isSupervisor(req),
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
                unverifiedDrops: result.unverifiedDrops,
            });

        } catch (error: any) {
            logWithContext("error", "[CashDrawer] Close drawer failed", {
                error: error.message,
            });

            return drawerError(res, error, "Failed to close drawer");
        }
    }

    //POST /api/cash/:drawerUuid/drop
    static async cashDrop(req: Request, res: Response) {
        try {
            const { drawerUuid } = req.params;
            const { amount, reason } = req.body;

            const cashDrop = await CashDrawerService.createCashDrop({
                tenantUuid: req.tenant!.uuid,
                drawerUuid,
                amount,
                droppedBy: req.user!.userUuid,
                actorIsSupervisor: isSupervisor(req),
                reason,
            });
    
            return res.status(201).json({
                success: true,
                cashDrop,
            });

        } catch (error: any) {
            return drawerError(res, error, "Failed to record cash drop");
        }
    }

    //POST /api/cash-drawer/drop/:cashDropUuid/verify
    static async verifyCashDrop(req: Request, res: Response) {
        try {
            const { cashDropUuid } = req.params;

            const cashDrop = await CashDrawerService.verifyCashDrop({
                tenantUuid: req.tenant!.uuid,
                cashDropUuid,
                verifiedBy: req.user!.userUuid,
            });

            return res.status(200).json({
                success: true,
                cashDrop,
            });

        } catch (error: any) {
            return drawerError(res, error, "Failed to verify cash drop");
        }
    }

    //GET /api/cash-drawer/active
    static async getActiveDrawer(req: Request, res: Response) {
        try {
            const userUuid = req.user!.userUuid;
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