import { prisma } from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { redis } from "../../lib/redis.ts";

export class SettingsService {

    //Get tenant settings
    static async getTenantSettings(tenantUuid: string) {
        try {
            // Try cache first
            const cacheKey = `settings:tenant:${tenantUuid}`;
            const cached = await redis.get(cacheKey);

            if (cached) {
                return JSON.parse(cached);
            }

            // Get from database
            let settings = await prisma.tenantSettings.findUnique({
                where: { tenantUuid },
            });

            // Create default settings if not exists
            if (!settings) {
                settings = await prisma.tenantSettings.create({
                    data: {
                        tenantUuid,
                        currency: "USD",
                        timezone: "UTC",
                        taxRate: 0,
                        serviceChargeRate: 0,
                        orderAutoCompleteMinutes: 30,
                        orderAutoCancelMinutes: 15,
                        emailNotifications: true,
                        smsNotifications: false,
                        pushNotifications: true,
                    },
                });
            };

            // Cache for 1 hour
            await redis.setex(cacheKey, 3600, JSON.stringify(settings));

            return settings;
        } catch (error: any) {
            logWithContext("error", "[Settings] Failed to get tenant settings", {
                error: error.message,
                tenantUuid,
            });
            throw error;
        }
    }

    //Update tenant settings
    static async updateTenantSettings(input: {
        tenantUuid: string;
        data: {
            currency?: string;
            timezone?: string;
            taxRate?: number;
            serviceChargeRate?: number;
            orderAutoCompleteMinutes?: number;
            orderAutoCancelMinutes?: number;
            emailNotifications?: boolean;
            smsNotifications?: boolean;
            pushNotifications?: boolean;
            businessHours?: any;
            locale?: string;
        };
        updatedBy: string;
    }) {
        try {
            const updated = await prisma.tenantSettings.upsert({
                where: { tenantUuid: input.tenantUuid },
                update: {
                    ...input.data,
                    updatedAt: new Date(),
                },
                create: {
                    tenantUuid: input.tenantUuid,
                    ...input.data,
                },
            });

            // Invalidate cache
            const cacheKey = `settings:tenant:${input.tenantUuid}`;
            await redis.del(cacheKey);

            logWithContext("info", "[Settings] Tenant settings updated", {
                tenantUuid: input.tenantUuid,
                updatedBy: input.updatedBy,
            });

            return updated;

        } catch (error: any) {
            logWithContext("error", "[Settings] Failed to update tenant settings", {
                error: error.message,
            });
            throw error;
        }
    }

    //Get store settings
    static async getStoreSettings(storeUuid: string) {
        try {
            const cacheKey = `settings:store:${storeUuid}`;
            const cached = await redis.get(cacheKey);

            if (cached) {
                return JSON.parse(cached);
            }

            let settings = await prisma.storeSettings.findUnique({
                where: { storeUuid },
            });

            if (!settings) {
                settings = await prisma.storeSettings.create({
                    data: {
                        storeUuid,
                        autoAcceptOrders: false,
                        orderPrepTimeMinutes: 15,
                        maxOrdersPerHour: 100,
                        allowPreorders: false,
                        requireTableNumber: false,
                    },
                });
            };

            await redis.setex(cacheKey, 3600, JSON.stringify(settings));

            return settings;

        } catch (error: any) {
            logWithContext("error", "[Settings] Failed to get store settings", {
                error: error.message,
                storeUuid,
            });
            throw error;
        }
    }

    //Update store settings
    static async updateStoreSettings(input: {
        storeUuid: string;
        data: {
        autoAcceptOrders?: boolean;
        orderPrepTimeMinutes?: number;
        maxOrdersPerHour?: number;
        allowPreorders?: boolean;
        requireTableNumber?: boolean;
        minimumOrderAmount?: number;
        deliveryFee?: number;
        deliveryRadius?: number;
        };
        updatedBy: string;
    }) {
        try {
            const updated = await prisma.storeSettings.upsert({
                where: { storeUuid: input.storeUuid },
                update: {
                    ...input.data,
                    updatedAt: new Date(),
                },
                create: {
                    storeUuid: input.storeUuid,
                    ...input.data,
                },
            });

            // Invalidate cache
            const cacheKey = `settings:store:${input.storeUuid}`;
            await redis.del(cacheKey);

            logWithContext("info", "[Settings] Store settings updated", {
                storeUuid: input.storeUuid,
                updatedBy: input.updatedBy,
            });

            return updated;

        } catch (error: any) {
            logWithContext("error", "[Settings] Failed to update store settings", {
                error: error.message,
            });
            throw error;
        }
    }

   //Get user preferences
    static async getUserPreferences(userUuid: string) {
        try {
            let preferences = await prisma.userPreferences.findUnique({
                where: { userUuid },
            });

            if (!preferences) {
                preferences = await prisma.userPreferences.create({
                data: {
                    userUuid,
                    emailNotifications: true,
                    smsNotifications: true,
                    pushNotifications: true,
                    language: "en",
                    theme: "light",
                },
                });
            };

            return preferences;

        } catch (error: any) {
            logWithContext("error", "[Settings] Failed to get user preferences", {
                error: error.message,
                userUuid,
            });
            throw error;
        }
    }

    //Update user preferences
    static async updateUserPreferences(input: {
        userUuid: string;
        data: {
            emailNotifications?: boolean;
            smsNotifications?: boolean;
            pushNotifications?: boolean;
            language?: string;
            theme?: string;
        };
    }) {
        try {
            const updated = await prisma.userPreferences.upsert({
                where: { userUuid: input.userUuid },
                update: {
                    ...input.data,
                    updatedAt: new Date(),
                },
                create: {
                    userUuid: input.userUuid,
                    ...input.data,
                },
            });

            logWithContext("info", "[Settings] User preferences updated", {
                userUuid: input.userUuid,
            });

            return updated;

        } catch (error: any) {
            logWithContext("error", "[Settings] Failed to update user preferences", {
                error: error.message,
            });
            throw error;
        }
    }
}