type EventPayload = Record<string, any>;
type EventHandler = (payload: EventPayload) => Promise<void> | void;

class EventBus {
    private listeners = new Map<string, EventHandler[]>();
  
    //Register event listener
    on(event: string, handler: EventHandler) {
        const handlers = this.listeners.get(event) || [];
        handlers.push(handler);
        this.listeners.set(event, handlers);
    }
  
    //Emit event to all listeners
    async emit(event: string, payload: EventPayload) {
        const handlers = this.listeners.get(event) || [];
        
        for (const handler of handlers) {
            try {
                await handler(payload);
            } catch (error: any) {
                console.error(`[EventBus] Error in handler for event ${event}:`, error.message);
                // Continue processing other handlers even if one fails
            }
        }
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
  }
  
  // ✅ SINGLE GLOBAL INSTANCE - This is correct!
  export const eventBus = new EventBus();
  
  // For backwards compatibility
  export { eventBus as EventBus };
  export { eventBus as PaymentEventBus };
  export { eventBus as OrderEventBus };
  export { eventBus as RefundEventBus };