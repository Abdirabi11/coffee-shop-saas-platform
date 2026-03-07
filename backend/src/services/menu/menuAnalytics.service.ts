import prisma from "../../config/prisma.ts"

export class MenuAnalyticsService {
    static async trackMenuView(input: {
        tenantUuid: string;  // ✅ Required
        storeUuid: string;
        userUuid?: string;
        sessionId?: string;
        deviceType?: string;
        platform?: string;
    }) {
        try {
            await prisma.menuAnalyticEvents.create({
                data: {
                    tenantUuid: input.tenantUuid,  // ✅ Fixed
                    storeUuid: input.storeUuid,
                    eventType: "MENU_VIEW",  // ✅ Consistent field name
                    eventCategory: "MENU",
                    userUuid: input.userUuid,
                    sessionId: input.sessionId,
                    deviceType: input.deviceType as any,
                    platform: input.platform,
                    isAuthenticated: !!input.userUuid,
                },
            });
        } catch (error) {
            // ✅ Error handling
            console.error("[MenuAnalytics] Track failed:", error);
            // Don't throw - analytics should not break main flow
        }
    }

    static async trackProductView(input: {
        tenantUuid: string;
        storeUuid: string;
        productUuid: string;
        productPrice: number;
        userUuid?: string;
        sessionId?: string;
    }) {
        try {
            await prisma.menuAnalyticEvents.create({
                data: {
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    eventType: "PRODUCT_VIEW",  // ✅ Fixed
                    eventCategory: "PRODUCT",
                    entityType: "PRODUCT",
                    entityUuid: input.productUuid,
                    productPrice: input.productPrice,
                    userUuid: input.userUuid,
                    sessionId: input.sessionId,
                    isAuthenticated: !!input.userUuid,
                },
            });
        } catch (error) {
            console.error("[MenuAnalytics] Track failed:", error);
        }
    }
}