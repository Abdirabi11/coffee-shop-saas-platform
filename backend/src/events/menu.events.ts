import { logWithContext } from "../infrastructure/observability/Logger.ts";
import { EventBus } from "./eventBus.ts";


type MenuEventType =
  | "MENU_INVALIDATED"
  | "MENU_PREWARMED"
  | "MENU_SNAPSHOT_CREATED"
  | "PRICE_CHANGED"
  | "PRODUCT_ADDED"
  | "PRODUCT_REMOVED"
  | "AVAILABILITY_CHANGED";

export class MenuEventService {
  
    static async emit(
        event: MenuEventType,
        payload: {
            tenantUuid: string;
            storeUuid: string;
            reason?: string;
            triggeredBy?: string;
            metadata?: Record<string, any>;
        }
    ) {
        try {
            logWithContext("info", `[MenuEvent] ${event}`, payload);

            // Emit to event bus
            EventBus.emit(event, payload);

            // Future integrations:
            // - Webhook notifications
            // - Slack alerts
            // - Email notifications
            // - Search index updates
            // - Analytics pipeline

        } catch (error: any) {
            logWithContext("error", "[MenuEvent] Emit failed", {
                event,
                error: error.message,
            });
        }
    }
}