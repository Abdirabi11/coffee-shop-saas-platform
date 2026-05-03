import type { Request, Response } from "express"
import { MenuAnalyticsService } from "../../services/menu/menuAnalytics.service.ts";

export class MenuAnalyticsController {
 
    static async trackEvent(req: Request, res: Response) {
        try {
            const tenantUuid = req.headers["x-tenant-uuid"] as string;
            const { storeUuid, eventType, eventCategory, entityType, entityUuid, entityName, productPrice, quantity, sessionId, deviceType, platform } = req.body;
 
            if (!storeUuid || !eventType || !eventCategory) {
                return res.status(400).json({ success: false, error: "STORE_EVENT_TYPE_CATEGORY_REQUIRED" });
            }
 
            const user = (req as any).user;
 
            await MenuAnalyticsService.trackEvent({
                tenantUuid,
                storeUuid,
                eventType,
                eventCategory,
                entityType,
                entityUuid,
                entityName,
                userUuid: user?.userUuid,
                sessionId,
                deviceType,
                platform,
                productPrice,
                quantity,
            });
 
            return res.status(200).json({ success: true, message: "Event tracked" });
        } catch (error: any) {
            // Analytics should never fail the request
            return res.status(200).json({ success: true, message: "Event acknowledged" });
        }
    }
 
    static async getSummary(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const { dateFrom, dateTo } = req.query;
 
            if (!storeUuid || !dateFrom || !dateTo) {
                return res.status(400).json({ success: false, error: "STORE_AND_DATE_RANGE_REQUIRED" });
            }
 
            const summary = await MenuAnalyticsService.getAnalyticsSummary({
                storeUuid,
                dateFrom: new Date(dateFrom as string),
                dateTo: new Date(dateTo as string),
            });
 
            return res.status(200).json({ success: true, data: summary });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }
}