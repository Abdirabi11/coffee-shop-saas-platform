import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MenuAnalyticsService } from "./menuAnalytics.service.ts";

export class FavoriteService {
  
    static async toggleFavorite(input: {
        tenantUuid: string;
        userUuid: string;
        storeUuid: string;
        productUuid: string;
    }) {
        try {
            const existing = await prisma.userFavorite.findUnique({
                where: {
                    userUuid_productUuid: {
                        userUuid: input.userUuid,
                        productUuid: input.productUuid,
                    },
                },
            });

            if (existing) {
                // Remove favorite
                await prisma.userFavorite.delete({
                    where: { uuid: existing.uuid },
                });

                logWithContext("info", "[Favorite] Removed", {
                    userUuid: input.userUuid,
                    productUuid: input.productUuid,
                });

                // Track analytics
                MenuAnalyticsService.trackEvent({
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    eventType: "FAVORITE_REMOVED",
                    eventCategory: "USER_ACTION",
                    entityType: "PRODUCT",
                    entityUuid: input.productUuid,
                    userUuid: input.userUuid,
                }).catch(() => {});

                return { favorited: false };
            } else {
                // Add favorite
                await prisma.userFavorite.create({
                    data: {
                        userUuid: input.userUuid,
                        storeUuid: input.storeUuid,
                        productUuid: input.productUuid,
                    },
                });

                logWithContext("info", "[Favorite] Added", {
                    userUuid: input.userUuid,
                    productUuid: input.productUuid,
                });

                // Track analytics
                MenuAnalyticsService.trackEvent({
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    eventType: "FAVORITE_ADDED",
                    eventCategory: "USER_ACTION",
                    entityType: "PRODUCT",
                    entityUuid: input.productUuid,
                    userUuid: input.userUuid,
                }).catch(() => {});

                return { favorited: true };
            }

        } catch (error: any) {
            logWithContext("error", "[Favorite] Toggle failed", {
                userUuid: input.userUuid,
                productUuid: input.productUuid,
                error: error.message,
            });

            throw new Error("FAVORITE_TOGGLE_FAILED");
        }
    }

    static async getUserFavorites(input: {
        userUuid: string;
        storeUuid: string;
    }) {
        try {
            const favorites = await prisma.userFavorite.findMany({
                where: {
                    userUuid: input.userUuid,
                    storeUuid: input.storeUuid,
                },
                include: {
                    product: {
                        select: {
                            uuid: true,
                            name: true,
                            description: true,
                            imageUrl: true,
                            basePrice: true,
                            isActive: true,
                            isAvailable: true,
                            category: {
                                select: {
                                    uuid: true,
                                    name: true,
                                },
                            },
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
            });

            return favorites.map((f) => f.product);

        } catch (error: any) {
            logWithContext("error", "[Favorite] Get favorites failed", {
                userUuid: input.userUuid,
                error: error.message,
            });

            throw error;
        }
    }
}