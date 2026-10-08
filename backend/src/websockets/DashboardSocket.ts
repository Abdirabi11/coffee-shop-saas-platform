import { Server as SocketIOServer } from "socket.io";
import { Server } from "http";
import { logWithContext } from "../infrastructure/observability/Logger.ts";
import { EventBus } from "../events/eventBus.ts";
import prisma from "../config/prisma.ts";
import { verifyAccessToken } from "../utils/jwt.ts";
import type { AccessTokenPayload } from "../types/auth.types.ts";

// Who the socket is, from the database at handshake (not token claims)
export interface SocketIdentity {
  userUuid: string;
  isSuperAdmin: boolean;
}

// Tenant-level roles that see the tenant-wide room (every store's orders and
// payments, billing and quota events). Plain members - customers, store
// staff - don't; store staff use their store's room.
const TENANT_ROOM_ROLES = ["TENANT_ADMIN", "REGIONAL_MANAGER"];

// Rooms are tenant/store scoped; a client may only join rooms it has a
// current, verified right to.
export async function canJoinDashboardRoom(identity: SocketIdentity, room: unknown): Promise<boolean> {
  if (typeof room !== "string") return false;

  if (room === "superadmin") return identity.isSuperAdmin;

  const [scope, uuid, ...rest] = room.split(":");
  if (!uuid || rest.length > 0) return false;
  if (identity.isSuperAdmin) return scope === "tenant" || scope === "store";

  if (scope === "tenant") return isTenantLevelMember(identity.userUuid, uuid);

  if (scope === "store") {
    const store = await prisma.store.findUnique({ where: { uuid }, select: { tenantUuid: true } });
    if (!store) return false;
    const assignment = await prisma.userStore.findFirst({
      where: { userUuid: identity.userUuid, storeUuid: uuid, tenantUuid: store.tenantUuid, isActive: true },
      select: { uuid: true },
    });
    return !!assignment || isTenantLevelMember(identity.userUuid, store.tenantUuid);
  }

  return false;
}

async function isTenantLevelMember(userUuid: string, tenantUuid: string): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({ where: { uuid: tenantUuid }, select: { ownerUuid: true } });
  if (!tenant) return false;
  if (tenant.ownerUuid === userUuid) return true;
  const membership = await prisma.tenantUser.findFirst({
    where: { userUuid, tenantUuid, isActive: true, role: { in: TENANT_ROOM_ROLES as any } },
    select: { uuid: true },
  });
  return !!membership;
}

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
          select: { tokenVersion: true, isBanned: true, globalRole: true },
        });

        if (!user || user.isBanned || payload.tokenVersion !== user.tokenVersion) {
          return next(new Error("Invalid token"));
        }

        socket.data.user = payload;
        // Super admin from the database, like the HTTP routes (a token's
        // role claim outlives a demotion)
        socket.data.identity = {
          userUuid: payload.userUuid,
          isSuperAdmin: user.globalRole === "SUPER_ADMIN",
        } satisfies SocketIdentity;
        next();
      } catch (error) {
        next(new Error("Invalid token"));
      }
    });
  }

  private setupConnectionHandlers() {
    this.io.on("connection", async (socket) => {
      const user = socket.data.user as AccessTokenPayload;
      const identity = socket.data.identity as SocketIdentity;

      logWithContext("info", "[DashboardSocket] Client connected", {
        socketId: socket.id,
        userUuid: user.userUuid,
      });

      // Handle room subscriptions
      socket.on("subscribe", async (room: string) => {
        try {
          if (!(await canJoinDashboardRoom(identity, room))) {
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

      // Default rooms, each through the same check as an explicit subscribe
      // (the token's tenant/store only suggest which rooms to try)
      const defaults = [
        "superadmin",
        user.tenantUuid ? `tenant:${user.tenantUuid}` : null,
        user.storeUuid ? `store:${user.storeUuid}` : null,
      ];
      for (const room of defaults) {
        try {
          if (room && (await canJoinDashboardRoom(identity, room))) socket.join(room);
        } catch (error: any) {
          logWithContext("error", "[DashboardSocket] Default room check failed", {
            socketId: socket.id,
            error: error.message,
          });
        }
      }
    });
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