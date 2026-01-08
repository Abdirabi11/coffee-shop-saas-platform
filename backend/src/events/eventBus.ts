type EventPayload = Record<string, any>;
type EventHandler = (payload: EventPayload) => Promise<void> | void;

class EventBus {
    private listeners= new Map<string, EventHandler[]>();

    on(event: string, handler: EventHandler){
        const handlers= this.listeners.get(event) || []
        handlers.push(handler);
        this.listeners.set(event, handlers);
    };

    async emit(event: string, payload: EventPayload){
        const handlers= this.listeners.get(event) || []
        for(const handler of handlers){
            await handler(payload)
        }
    }
};

export const eventBus = new EventBus();