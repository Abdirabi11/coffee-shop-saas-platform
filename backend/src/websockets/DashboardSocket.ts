import { Server as SocketIOServer } from "socket.io";
import { Server } from "http";
import { logWithContext } from "../infrastructure/observability/Logger.ts";
import { EventBus } from "../events/eventBus.ts";
import prisma from "../config/prisma.ts";
import { verifyAccessToken } from "../utils/jwt.ts";
import type { AccessTokenPayload } from "../types/auth.types.ts";

export class DashboardSocket {
  private io: SocketIOServer;

  constructor(server: Server) {
    this.io = new SocketIOServer(server, {
    cors: {
      origin: process.env.CLIENT_URL,
      credentials: true,
    },
      path: "/socket.io/dashboard",
    });

    this.setupAuthentication();
    this.setupEventListeners();
    this.setupConnectionHandlers();
  }

  private setupAuthentication() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;

        if (!token) {
          return next(new Error("Authentication required"));
        }

        const payload = verifyAccessToken(token);

        // Same revocation checks as the HTTP `authenticate` middleware
        const user = await prisma.user.findUnique({
          where: { uuid: payload.userUuid },
          select: { tokenVersion: true, isBanned: true },
        });

        if (!user || user.isBanned || payload.tokenVersion !== user.tokenVersion) {
          return next(new Error("Invalid token"));
        }

        socket.data.user = payload;
        next();
      } catch (error) {
        next(new Error("Invalid token"));
      }
    });
  }

  private setupConnectionHandlers() {
    this.io.on("connection", (socket) => {
      const user = socket.data.user as AccessTokenPayload;

      logWithContext("info", "[DashboardSocket] Client connected", {
        socketId: socket.id,
        userUuid: user.userUuid,
      });

      // Join appropriate rooms based on role
      if (user.role === "SUPER_ADMIN") {
        socket.join("superadmin");
      }

      if (user.tenantUuid) {
        socket.join(`tenant:${user.tenantUuid}`);
      }

      if (user.storeUuid) {
        socket.join(`store:${user.storeUuid}`);
      }

      // Handle room subscriptions
      socket.on("subscribe", async (room: string) => {
        try {
          if (!(await this.canJoinRoom(user, room))) {
            logWithContext("warn", "[DashboardSocket] Room subscription denied", {
              socketId: socket.id,
              userUuid: user.userUuid,
              room,
            });
            socket.emit("subscribe:denied", { room });
            return;
          }

          socket.join(room);
          logWithContext("info", "[DashboardSocket] Subscribed to room", {
            socketId: socket.id,
            room,
          });
        } catch (error: any) {
          logWithContext("error", "[DashboardSocket] Subscribe failed", {
            socketId: socket.id,
            error: error.message,
          });
        }
      });

      socket.on("unsubscribe", (room: string) => {
        socket.leave(room);
      });

      socket.on("disconnect", () => {
        logWithContext("info", "[DashboardSocket] Client disconnected", {
          socketId: socket.id,
        });
      });
    });
  }

  // Rooms are tenant/store scoped; a client may only join rooms it has an
  // active membership for.
  private async canJoinRoom(user: AccessTokenPayload, room: string): Promise<boolean> {
    if (typeof room !== "string") return false;

    if (room === "superadmin") {
      return user.role === "SUPER_ADMIN";
    }

    const [scope, uuid, ...rest] = room.split(":");
    if (!uuid || rest.length > 0) return false;

    if (scope === "tenant") {
      if (user.role === "SUPER_ADMIN") return true;
      const membership = await prisma.tenantUser.findFirst({
        where: { userUuid: user.userUuid, tenantUuid: uuid, isActive: true },
        select: { uuid: true },
      });
      return !!membership;
    }

    if (scope === "store") {
      if (user.role === "SUPER_ADMIN") return true;
      const membership = await prisma.userStore.findFirst({
        where: { userUuid: user.userUuid, storeUuid: uuid, isActive: true },
        select: { uuid: true },
      });
      return !!membership;
    }

    return false;
  }

  private setupEventListeners() {
    // Order events
    EventBus.on("ORDER_CREATED", async (data) => {
      const { tenantUuid, storeUuid, order } = data;

      // Update store dashboard
      this.io.to(`store:${storeUuid}`).emit("order:created", {
        order,
        timestamp: new Date(),
      });

      // Update tenant dashboard
      this.io.to(`tenant:${tenantUuid}`).emit("order:created", {
        storeUuid,
        timestamp: new Date(),
      });

      // Update super admin dashboard
      this.io.to("superadmin").emit("order:created", {
        tenantUuid,
        storeUuid,
        timestamp: new Date(),
      });
    });

    EventBus.on("ORDER_COMPLETED", async (data) => {
      const { tenantUuid, storeUuid, order } = data;

      this.io.to(`store:${storeUuid}`).emit("order:completed", {
        order,
        timestamp: new Date(),
      });

      this.io.to(`tenant:${tenantUuid}`).emit("order:completed", {
        storeUuid,
        timestamp: new Date(),
      });
    });

    // Payment events
    EventBus.on("PAYMENT_SUCCESS", async (data) => {
      const { tenantUuid, storeUuid, payment } = data;

      this.io.to(`store:${storeUuid}`).emit("payment:success", {
        amount: payment.amount,
        timestamp: new Date(),
      });

      this.io.to(`tenant:${tenantUuid}`).emit("payment:success", {
        storeUuid,
        amount: payment.amount,
        timestamp: new Date(),
      });

      this.io.to("superadmin").emit("payment:success", {
        tenantUuid,
        amount: payment.amount,
        timestamp: new Date(),
      });
    });

    EventBus.on("PAYMENT_FAILED", async (data) => {
      const { tenantUuid, storeUuid, payment } = data;

      this.io.to(`store:${storeUuid}`).emit("payment:failed", {
        timestamp: new Date(),
      });

      this.io.to("superadmin").emit("payment:failed", {
        tenantUuid,
        storeUuid,
        timestamp: new Date(),
      });
    });

    // Subscription events
    EventBus.on("SUBSCRIPTION_CREATED", async (data) => {
      const { tenantUuid, subscription } = data;

      this.io.to(`tenant:${tenantUuid}`).emit("subscription:created", {
        subscription,
        timestamp: new Date(),
      });

      this.io.to("superadmin").emit("subscription:created", {
        tenantUuid,
        timestamp: new Date(),
      });
    });

    EventBus.on("SUBSCRIPTION_CANCELLED", async (data) => {
      const { tenantUuid } = data;

      this.io.to(`tenant:${tenantUuid}`).emit("subscription:cancelled", {
        timestamp: new Date(),
      });

      this.io.to("superadmin").emit("subscription:cancelled", {
        tenantUuid,
        timestamp: new Date(),
      });
    });

    // Quota events
    EventBus.on("QUOTA_NEARLY_EXCEEDED", async (data) => {
      const { tenantUuid, quotaKey, usagePercent } = data;

      this.io.to(`tenant:${tenantUuid}`).emit("quota:warning", {
        quotaKey,
        usagePercent,
        timestamp: new Date(),
      });
    });

    EventBus.on("QUOTA_EXCEEDED", async (data) => {
      const { tenantUuid, quotaKey } = data;

      this.io.to(`tenant:${tenantUuid}`).emit("quota:exceeded", {
        quotaKey,
        timestamp: new Date(),
      });
    });

    // Fraud events
    EventBus.on("FRAUD_EVENT_DETECTED", async (data) => {
      const { severity, type, userUuid } = data;

      if (severity === "CRITICAL" || severity === "HIGH") {
        this.io.to("superadmin").emit("fraud:alert", {
          severity,
          type,
          userUuid,
          timestamp: new Date(),
        });
      }
    });

    // Alert events
    EventBus.on("ADMIN_ALERT_CREATED", async (data) => {
      const { alert } = data;

      this.io.to("superadmin").emit("alert:new", {
        alert,
        timestamp: new Date(),
      });
    });
  }

  broadcastDashboardRefresh(scope: "superadmin" | string) {
    this.io.to(scope).emit("dashboard:refresh", {
      timestamp: new Date(),
    });
  }
}