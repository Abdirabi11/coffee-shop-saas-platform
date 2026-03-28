import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";

export class MenuAnalyticsService {
    
    //Track analytics event
    static async trackEvent(input: {
        tenantUuid: string;
        storeUuid: string;
        eventType: string;
        eventCategory: string;
        entityType?: string;
        entityUuid?: string;
        entityName?: string;
        userUuid?: string;
        sessionId?: string;
        deviceType?: string;
        platform?: string;
        productPrice?: number;
        quantity?: number;
        metadata?: any;
    }) {
    try {
      // Don't block on analytics failure
        await prisma.menuAnalyticEvent.create({
            data: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                eventType: input.eventType as any,
                eventCategory: input.eventCategory as any,
                entityType: input.entityType as any,
                entityUuid: input.entityUuid,
                entityName: input.entityName,
                userUuid: input.userUuid,
                sessionId: input.sessionId,
                isAuthenticated: !!input.userUuid,
                deviceType: input.deviceType as any,
                platform: input.platform as any,
                productPrice: input.productPrice,
                quantity: input.quantity,
                metadata: input.metadata || {},
            },
        });

            MetricsService.increment("menu.analytics.event", 1, {
                eventType: input.eventType,
            });

        } catch (error: any) {
            // Log but don't throw - analytics should never break main flow
            logWithContext("warn", "[MenuAnalytics] Track event failed", {
                eventType: input.eventType,
                error: error.message,
            });
        }
    }

    //Track menu view
    static async trackMenuView(input: {
        tenantUuid: string;
        storeUuid: string;
        userUuid?: string;
        sessionId?: string;
        deviceType?: string;
        platform?: string;
    }) {
        return this.trackEvent({
            ...input,
            eventType: "MENU_VIEW",
            eventCategory: "MENU",
        });
    }

    static async trackProductView(input: {
        tenantUuid: string;
        storeUuid: string;
        productUuid: string;
        productName: string;
        productPrice: number;
        userUuid?: string;
        sessionId?: string;
    }) {
        // Track event
        await this.trackEvent({
            ...input,
            eventType: "PRODUCT_VIEW",
            eventCategory: "PRODUCT",
            entityType: "PRODUCT",
            entityUuid: input.productUuid,
            entityName: input.productName,
        });

        // Increment product view count (async, don't block)
        prisma.product
            .update({
                where: { uuid: input.productUuid },
                data: {
                    viewCount: { increment: 1 },
                },
            })
            .catch((error) => {
                logWithContext("warn", "[MenuAnalytics] View count update failed", {
                error: error.message,
                });
            });
    }

    static async trackAddToCart(input: {
        tenantUuid: string;
        storeUuid: string;
        productUuid: string;
        productName: string;
        productPrice: number;
        quantity: number;
        userUuid?: string;
        sessionId?: string;
    }) {
        return this.trackEvent({
            ...input,
            eventType: "PRODUCT_ADD_TO_CART",
            eventCategory: "PRODUCT",
            entityType: "PRODUCT",
            entityUuid: input.productUuid,
            entityName: input.productName,
            funnelStep: "ADD_TO_CART",
        });
    }

    static async getAnalyticsSummary(input: {
        storeUuid: string;
        dateFrom: Date;
        dateTo: Date;
    }) {
        try {
            const events = await prisma.menuAnalyticEvent.findMany({
                where: {
                storeUuid: input.storeUuid,
                occurredAt: {
                    gte: input.dateFrom,
                    lte: input.dateTo,
                },
                },
            });

            const summary = {
                totalEvents: events.length,
                menuViews: events.filter((e) => e.eventType === "MENU_VIEW").length,
                productViews: events.filter((e) => e.eventType === "PRODUCT_VIEW").length,
                addToCarts: events.filter((e) => e.eventType === "PRODUCT_ADD_TO_CART").length,
                uniqueSessions: new Set(events.map((e) => e.sessionId).filter(Boolean)).size,
                uniqueUsers: new Set(events.map((e) => e.userUuid).filter(Boolean)).size,
            };

            return summary;

        } catch (error: any) {
            logWithContext("error", "[MenuAnalytics] Get summary failed", {
                error: error.message,
            })

            throw error;
        }
    }
}