import prisma from "../../config/prisma.ts"

export class MenuAnalyticsService{
    static async trackMenuView(storeUuid: string, meta?:any){
        await prisma.menuAnalyticEvents.create({
            data: {
                storeUuid,
                eventType: "MENU_VIEW",
                deviceType: meta?.deviceType,
                sessionId: meta?.sessionId,
            },
        })
    };

    static async trackCategoryView(storeUuid: string, categoryUuid: string){
        await prisma.menuAnalyticEvents.create({
            data: {
                storeUuid,
                type: "CATEGORY_VIEW",
                entityUuid: categoryUuid
            }
        })
    };

    static async trackProductView(storeUuid: string, productUuid: string){
        await prisma.menuAnalyticEvents.create({
            data: {
                storeUuid,
                type: "PRODUCT_VIEW",
                entityUuid: productUuid
            }
        })
    }
}