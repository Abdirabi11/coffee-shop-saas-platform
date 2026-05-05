import prisma from "../config/prisma.ts"

type EventPayload = Record<string, any>;
type EventHandler = (payload: EventPayload) => Promise<void> | void;

class EventBus {
  private listeners = new Map<string, EventHandler[]>();
  private auditableEvents = new Set<string>([
    // Product events
    "PRODUCT_CREATED",
    "PRODUCT_UPDATED",
    "PRODUCT_DELETED",
    "PRODUCT_BULK_UPDATED",
    
    // Payment events
    "PAYMENT_CONFIRMED",
    "PAYMENT_FAILED",
    "REFUND_COMPLETED",
    
    // Order events
    "ORDER_CREATED",
    "ORDER_CANCELLED",
  ]);
  
  //Register event listener
  on(event: string, handler: EventHandler) {
    const handlers = this.listeners.get(event) || [];
    handlers.push(handler);
    this.listeners.set(event, handlers);
  }
  
  //Emit event to all listeners
  async emit(event: string, payload: EventPayload) {
    //Persist to audit log if auditable
    if (this.auditableEvents.has(event)) {
      await this.persistAudit(event, payload);
    }
    const handlers = this.listeners.get(event) || [];
    
    for (const handler of handlers) {
      try {
        await handler(payload);
      } catch (error: any) {
        console.error(`[EventBus] Error in handler for event ${event}:`, error.message);
        
        await this.logFailedHandler(event, payload, error);
      }
    }
  }

  //Persist audit trail to database
  private async persistAudit(event: string, payload: EventPayload) {
    try {
      await prisma.auditLog.create({
        data: {
          tenantUuid: payload.tenantUuid || "SYSTEM",
          action: event,
          entityType: this.extractEntityType(event),
          entityUuid: this.extractEntityUuid(payload),
          performedBy: payload.createdBy || payload.updatedBy || payload.deletedBy || "SYSTEM",
          metadata: payload,
          ipAddress: payload.ipAddress,
          userAgent: payload.userAgent,
          createdAt: new Date(),
        },
      });
    } catch (error: any) {
      console.error(`[EventBus] Failed to persist audit for ${event}:`, error.message);
    }
  }

  //Log failed event handler
  private async logFailedHandler(event: string, payload: EventPayload, error: Error) {
    try {  
      await prisma.eventFailureLog.create({
        data: {
          event,
          payload,
          error: error.message,
          stack: error.stack,
          createdAt: new Date(),
        },
      });
    } catch (logError: any) {
      console.error(`[EventBus] Failed to log error:`, logError.message);
    }
  }

  //Extract entity type from event name
  private extractEntityType(event: string): string {
    if (event.startsWith("PRODUCT_")) return "PRODUCT";
    if (event.startsWith("PAYMENT_")) return "PAYMENT";
    if (event.startsWith("ORDER_")) return "ORDER";
    return "UNKNOWN";
  }

  //Extract entity UUID from payload
  private extractEntityUuid(payload: EventPayload): string | undefined {
    return payload.productUuid || 
      payload.paymentUuid || 
      payload.orderUuid || 
      payload.uuid;
  }

  //Remove event listener
  off(event: string, handler: EventHandler) {
    const handlers = this.listeners.get(event) || [];
    const index = handlers.indexOf(handler);
    
    if (index > -1) {
      handlers.splice(index, 1);
      this.listeners.set(event, handlers);
    }
  }
  
  //Remove all listeners for an event
  removeAllListeners(event?: string) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
  
  //Get all registered events
  getEvents(): string[] {
    return Array.from(this.listeners.keys());
  }

  //Register event as auditable
  registerAuditableEvent(event: string) {
    this.auditableEvents.add(event);
  }
}
  
// ✅ SINGLE GLOBAL INSTANCE - This is correct!
export const eventBus = new EventBus();

// For backwards compatibility
export { eventBus as EventBus };
export { eventBus as PaymentEventBus };
export { eventBus as OrderEventBus };
export { eventBus as RefundEventBus };
export { eventBus as ProductEventBus };