import prisma from "../../config/prisma.ts"

type MenuEventType =
  | "MENU_INVALIDATED"
  | "MENU_PREWARMED"
  | "MENU_SNAPSHOT_CREATED"
  | "MENU_PRICE_CHANGED"
  | "MENU_VISIBILITY_CHANGED";

export class MenuEventService{
    static async emit(
        event: MenuEventType, 
        payload: {
            storeUuid: string;
            triggeredBy?: string;
            reason?: string;
            meta?: Record<string, any>;
        }
    ){
        await prisma.menuEvent.create({
            data: {
                storeUuid: payload.storeUuid,
                event,
                triggeredBy: payload.triggeredBy,
                meta: payload.meta ?? {},
            }
        })
        queueMicrotask(() => {
            console.log(`[MENU_EVENT] ${event}`, payload);
      
            // Future integrations:
            // - Slack webhook
            // - WebSocket push
            // - Search reindex
            // - BI pipeline
        });

        // Later:
        // - Slack alerts
        // - Admin notifications
    }

    // Call inside invalidateMenu():

    // MenuEventService.emit("MENU_UPDATED", { storeUuid });
};