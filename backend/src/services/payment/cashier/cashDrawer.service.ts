import prisma from "../../../config/prisma.ts"

export class CashDrawerService{
    //Open cash drawer for shift
    static async openDrawer(input: {
        storeUuid: string;
        terminalId: string;
        openingBalance: number;
        openedBy: string;
    }) {
        // Check no open drawer exists
        const existing = await prisma.cashDrawer.findFirst({
        where: {
            storeUuid: input.storeUuid,
            terminalId: input.terminalId,
            status: "OPEN",
        },
        });

        if (existing) {
            throw new Error("Drawer already open for this terminal");
        }

        const drawer = await prisma.cashDrawer.create({
            data: {
                tenantUuid: (await prisma.store.findUnique({ where: { uuid: input.storeUuid } }))!.tenantUuid,
                storeUuid: input.storeUuid,
                terminalId: input.terminalId,
                openingBalance: input.openingBalance,
                expectedCash: input.openingBalance,
                openedBy: input.openedBy,
                sessionStart: new Date(),
                status: "OPEN",
            },
        });

        console.log(`[CashDrawer] Opened: ${drawer.uuid}`);
        return drawer;
    }

    //Close cash drawer at end of shift
    static async closeDrawer(input: {
        drawerUuid: string;
        actualCash: number;
        actualCard: number;
        closedBy: string;
        closingNotes?: string;
    }){
        const drawer = await prisma.cashDrawer.findUnique({
            where: { uuid: input.drawerUuid },
        });

        if (!drawer || drawer.status !== "OPEN") {
            throw new Error("Drawer not open");
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

        // If significant variance, flag for review
        if (Math.abs(cashVariance) > 500 || Math.abs(cardVariance) > 500) {
            await prisma.adminAlert.create({
                data: {
                    tenantUuid: drawer.tenantUuid,
                    storeUuid: drawer.storeUuid,
                    alertType: "DRAWER_VARIANCE",
                    category: "FINANCIAL",
                    level: "WARNING",
                    priority: "HIGH",
                    title: "Cash Drawer Variance Detected",
                    message: `Terminal ${drawer.terminalId}: Cash variance ${cashVariance / 100}, Card variance ${cardVariance / 100}`,
                    context: {
                        drawerUuid: drawer.uuid,
                        cashVariance,
                        cardVariance,
                    },
                },
            });
        };

        return updated;
    }
}