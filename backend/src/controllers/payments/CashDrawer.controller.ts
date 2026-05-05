import { Request, Response } from "express";
import prisma from "../../config/prisma.ts"
import { CashDrawerService } from "../../services/staff/CashDrawer.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { closeDrawerSchema, openDrawerSchema } from "../../validators/payment.validator.ts";
 
export class CashDrawerController {
    // POST /api/v1/payments/drawer/open
    static async openDrawer(req: Request, res: Response) {
        try {
            const staff = (req as any).user;
            if (!staff) {
                return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
            }
        
            if (!["CASHIER", "MANAGER", "ADMIN"].includes(staff.role)) {
                return res.status(403).json({ success: false, error: "FORBIDDEN" });
            }
        
            const parsed = openDrawerSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({
                    success: false,
                    error: "VALIDATION_ERROR",
                    details: parsed.error.format(),
                });
            }
    
            const storeUuid = staff.storeUuid || req.body.storeUuid;
            if (!storeUuid) {
                return res.status(400).json({ success: false, error: "STORE_CONTEXT_REQUIRED" });
            }
        
            const tenantUuid = staff.tenantUuid;
            if (!tenantUuid) {
                return res.status(400).json({ success: false, error: "TENANT_CONTEXT_REQUIRED" });
            }
        
            const drawer = await CashDrawerService.openDrawer({
                tenantUuid, // FIX #1
                storeUuid,
                terminalId: parsed.data.terminalId,
                openingBalance: parsed.data.openingBalance,
                openedBy: staff.uuid,
            });
    
            return res.status(201).json({
                success: true,
                data: {
                    uuid: drawer.uuid,
                    terminalId: drawer.terminalId,
                    openingBalance: drawer.openingBalance,
                    sessionStart: drawer.sessionStart,
                },
            });
        } catch (error: any) {
            logWithContext("error", "[CashDrawerController] openDrawer failed", {
                error: error.message,
            });
        
            if (error.message.includes("ALREADY_OPEN")) {
                return res.status(409).json({ success: false, error: error.message });
            }
        
            return res.status(500).json({ success: false, error: "OPEN_DRAWER_FAILED" });
        }
    }
    
    // POST /api/v1/payments/drawer/:drawerUuid/close
    static async closeDrawer(req: Request, res: Response) {
        try {
            const staff = (req as any).user;
            if (!staff) {
                return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
            }
        
            if (!["CASHIER", "MANAGER", "ADMIN"].includes(staff.role)) {
                return res.status(403).json({ success: false, error: "FORBIDDEN" });
            }
        
            const { drawerUuid } = req.params;
        
            const parsed = closeDrawerSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({
                    success: false,
                    error: "VALIDATION_ERROR",
                    details: parsed.error.format(),
                });
            }
    
            const drawer = await CashDrawerService.closeDrawer({
                drawerUuid,
                actualCash: parsed.data.actualCash,
                actualCard: parsed.data.actualCard,
                closedBy: staff.uuid,
                closingNotes: parsed.data.closingNotes,
            });
    
            return res.status(200).json({
                success: true,
                data: {
                    uuid: drawer.uuid,
                    sessionStart: drawer.sessionStart,
                    sessionEnd: drawer.sessionEnd,
                    expectedCash: drawer.expectedCash,
                    actualCash: drawer.actualCash,
                    cashVariance: drawer.cashVariance,
                    expectedCard: drawer.expectedCard,
                    actualCard: drawer.actualCard,
                    cardVariance: drawer.cardVariance,
                    totalSales: drawer.totalSales,
                },
            });
        } catch (error: any) {
            logWithContext("error", "[CashDrawerController] closeDrawer failed", {
                error: error.message,
            });
        
            if (error.message.includes("NOT_OPEN")) {
                return res.status(400).json({ success: false, error: error.message });
            }
    
            return res.status(500).json({ success: false, error: "CLOSE_DRAWER_FAILED" });
        }
    }
    
    // GET /api/v1/payments/drawer/:drawerUuid
    static async getDrawer(req: Request, res: Response) {
        try {
            const { drawerUuid } = req.params;
        
            const drawer = await prisma.cashDrawer.findUnique({
                where: { uuid: drawerUuid, tenantUuid: staff.tenantUuid },
            });
        
            if (!drawer) {
                return res.status(404).json({ success: false, error: "DRAWER_NOT_FOUND" });
            }
        
            return res.status(200).json({ success: true, data: drawer });
        } catch (error: any) {
            logWithContext("error", "[CashDrawerController] getDrawer failed", {
                error: error.message,
            });
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
    
    // GET /api/v1/payments/drawer/active/:terminalId
    static async getActiveDrawer(req: Request, res: Response) {
        try {
            const { terminalId } = req.params;
            const staff = (req as any).user;
        
            if (!staff) {
                return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
            }
        
            const storeUuid = staff.storeUuid || (req.query.storeUuid as string);
            if (!storeUuid) {
                return res.status(400).json({ success: false, error: "STORE_CONTEXT_REQUIRED" });
            }
    
            const drawer = await prisma.cashDrawer.findFirst({
                where: {
                    tenantUuid: staff.tenantUuid, // FIX #2: tenant isolation
                    storeUuid,
                    terminalId,
                    status: "OPEN",
                },
            });
        
            if (!drawer) {
                return res.status(404).json({ success: false, error: "NO_ACTIVE_DRAWER" });
            }
    
            return res.status(200).json({ success: true, data: drawer });
        } catch (error: any) {
            logWithContext("error", "[CashDrawerController] getActiveDrawer failed", {
                error: error.message,
            });
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
}