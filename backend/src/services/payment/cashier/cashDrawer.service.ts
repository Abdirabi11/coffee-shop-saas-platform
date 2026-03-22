import prisma from "../../../config/prisma.ts"
import { logWithContext } from "../../../infrastructure/observability/logger.ts";

export class CashDrawerService{
    //Open cash drawer for shift
    static async openDrawer(input: {
        tenantUuid: string;
        storeUuid: string;
        terminalId: string;
        openingBalance: number;
        openedBy: string;
    }) {
        const existing = await prisma.cashDrawer.findFirst({
            where: {
                tenantUuid: input.tenantUuid, // FIX: Added tenant isolation
                storeUuid: input.storeUuid,
                terminalId: input.terminalId,
                status: "OPEN",
            },
        });
    
        if (existing) {
            throw new Error("DRAWER_ALREADY_OPEN");
        };
    
        const drawer = await prisma.cashDrawer.create({
            data: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                terminalId: input.terminalId,
                openingBalance: input.openingBalance,
                expectedCash: input.openingBalance,
                openedBy: input.openedBy,
                sessionStart: new Date(),
                status: "OPEN",
            },
        });
    
        logWithContext("info", "[CashDrawer] Opened", {
            drawerUuid: drawer.uuid,
            storeUuid: input.storeUuid,
            terminalId: input.terminalId,
            openingBalance: input.openingBalance,
        });
    
        return drawer;
    }
 
    // Close cash drawer at end of shift
    static async closeDrawer(input: {
        drawerUuid: string;
        actualCash: number;
        actualCard: number;
        closedBy: string;
        closingNotes?: string;
    }) {
        const drawer = await prisma.cashDrawer.findUnique({
            where: { uuid: input.drawerUuid },
        });
    
        if (!drawer || drawer.status !== "OPEN") {
            throw new Error("DRAWER_NOT_OPEN");
        }
    
        const cashVariance = input.actualCash - drawer.expectedCash;
        const cardVariance = input.actualCard - drawer.expectedCard;
    
        const updated = await prisma.cashDrawer.update({
            where: { uuid: input.drawerUuid },
            data: {
                actualCash: input.actualCash,
                actualCard: input.actualCard,
                cashVariance,
                cardVariance,
                closedBy: input.closedBy,
                closedAt: new Date(),
                sessionEnd: new Date(),
                closingNotes: input.closingNotes,
                status: "CLOSED",
            },
        });
    
        // If significant variance ($5+), flag for review
        if (Math.abs(cashVariance) > 500 || Math.abs(cardVariance) > 500) {
            await prisma.adminAlert.create({
                data: {
                    tenantUuid: drawer.tenantUuid,
                    storeUuid: drawer.storeUuid,
                    alertType: "PAYMENT_FAILED", // Closest valid AlertType
                    category: "FINANCIAL",
                    level: "WARNING",
                    priority: "HIGH",
                    source: "AUTOMATED_CHECK",
                    title: "Cash Drawer Variance Detected",
                    message: `Terminal ${drawer.terminalId}: Cash variance $${(cashVariance / 100).toFixed(2)}, Card variance $${(cardVariance / 100).toFixed(2)}`,
                    context: {
                        subType: "DRAWER_VARIANCE",
                        drawerUuid: drawer.uuid,
                        terminalId: drawer.terminalId,
                        cashVariance,
                        cardVariance,
                        closedBy: input.closedBy,
                    },
                },
            });
        
            logWithContext("warn", "[CashDrawer] Variance detected", {
                drawerUuid: drawer.uuid,
                cashVariance,
                cardVariance,
            });
        }
    
        logWithContext("info", "[CashDrawer] Closed", {
            drawerUuid: drawer.uuid,
            cashVariance,
            cardVariance,
        });
    
        return updated;
    }
}