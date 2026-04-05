import { Server as SocketIOServer } from "socket.io";
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

export class OrderRealtimeService{
    private static io: SocketIOServer;

    static initialize(io: SocketIOServer) {
      this.io = io;
      this.setupEventListeners();
    }

    //Setup event listeners to broadcast order updates
    private static setupEventListeners() {
        // Order status changed
        EventBus.on("ORDER_STATUS_CHANGED", async (payload) => {
            this.broadcastToStore(payload.storeUuid, "order:status-changed", {
                orderUuid: payload.orderUuid,
                oldStatus: payload.from,
                newStatus: payload.to,
                timestamp: payload.timestamp,
            });

            // Also broadcast to customer
            this.broadcastToUser(payload.tenantUserUuid, "order:update", {
                orderUuid: payload.orderUuid,
                status: payload.to,
            });
        });

        // New order created
        EventBus.on("ORDER_CREATED", async (payload) => {
            this.broadcastToStore(payload.storeUuid, "order:new", {
                orderUuid: payload.orderUuid,
                orderNumber: payload.orderNumber,
                totalAmount: payload.totalAmount,
            });
        });

        // Order ready
        EventBus.on("ORDER_READY_FOR_PICKUP", async (payload) => {
            this.broadcastToUser(payload.tenantUserUuid, "order:ready", {
                orderUuid: payload.orderUuid,
            });
        });
    }

    //Broadcast to all clients in a store
    private static broadcastToStore(
        storeUuid: string,
        event: string,
        data: any
    ) {
        this.io.to(`store:${storeUuid}`).emit(event, data);

        logWithContext("debug", "[Realtime] Broadcast to store", {
            storeUuid,
            event,
        });
    }

    //Broadcast to specific user
    private static broadcastToUser(
        userUuid: string,
        event: string,
        data: any
    ) {
        this.io.to(`user:${userUuid}`).emit(event, data);

        logWithContext("debug", "[Realtime] Broadcast to user", {
            userUuid,
            event,
        });
    }

    //Handle client connection
    static handleConnection(socket: any) {
        logWithContext("info", "[Realtime] Client connected", {
            socketId: socket.id,
        });

        // Join user room
        socket.on("join:user", (userUuid: string) => {
            socket.join(`user:${userUuid}`);
            logWithContext("debug", "[Realtime] User joined", { userUuid });
        });

        // Join store room (for staff)
        socket.on("join:store", (storeUuid: string) => {
            socket.join(`store:${storeUuid}`);
            logWithContext("debug", "[Realtime] Store joined", { storeUuid });
        });

        socket.on("disconnect", () => {
            logWithContext("debug", "[Realtime] Client disconnected", {
                socketId: socket.id,
            });
        });
    }

}