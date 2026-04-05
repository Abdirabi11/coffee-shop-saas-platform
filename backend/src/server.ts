import dotenv from "dotenv";

dotenv.config(); 

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { createServer } from "http";
import authRoutes from "./routes/auth/auth.routes.ts"
import { startScheduler } from "./jobs/scheduler.ts"
import { MetricsService } from "./infrastructure/observability/MetricsService.ts";
import { compressionMiddleware } from "./middlewares/compression.middleware.ts";
import { corsMiddleware } from "./middlewares/cors.middleware.ts";
import { securityHeadersMiddleware } from "./middlewares/securityHeaders.middleware.ts";
import { requestIdMiddleware } from "./middlewares/requestId.middleware.ts";
import { traceContext } from "./middlewares/traceContext.ts";
import { responseTimeMiddleware } from "./middlewares/responseTime.middleware.ts";
import { rawBodyMiddleware } from "./middlewares/rawBody.middleware.ts";
import { sanitizeInput } from "./middlewares/sanitization.middleware.ts";
import { maintenanceGuard } from "./middlewares/maintainence.ts";
import { deviceFingerprintMiddleware } from "./middlewares/deviceFingerprint.middleware.ts";
import { DashboardSocket } from "./websockets/DashboardSocket.ts";


const app = express();
const PORT: number = Number(process.env.PORT) || 5004;

app.use(helmet());
app.use(securityHeadersMiddleware);

app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true,
}));

app.use(compressionMiddleware);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
app.use(rawBodyMiddleware);

app.use(requestIdMiddleware);
app.use(traceContext);
app.use(responseTimeMiddleware);

app.use(sanitizeInput);

app.use(maintenanceGuard);
 
app.use(deviceFingerprintMiddleware);

// const httpServer = createServer(app);
// const dashboardSocket = new DashboardSocket(httpServer);

//SECURITY & INFRASTRUCTURE
app.use(corsMiddleware);

app.use( "/api/payments", express.raw({ type: "application/json" }) );

//PUBLIC ROUTES (No auth)
// app.use("/api/public", publicRoutes);

// WEBHOOK ROUTES (Special handling)
// app.use(
//   "/api/webhooks",
//   webhookRateLimit,
//   preventReplayAttack,
//   webhookSignatureGuard,
//   webhookRoutes
// );

// AUTHENTICATED ROUTES
// app.use("/api", [
//   authenticate,
//   requireTenantContext,
//   ensureTenantIsolation,
//   trackTenantUsage,
//   auditLogMiddleware,
//   protectedRoutes,
// ]);

//ERROR HANDLER (Last)
// app.use(errorHandler);

//registerPaymentEventHandlers()        → 12 handlers (fraud, alerts, metrics)
//registerSuperAdminDashboardHandlers() → 12 handlers (super admin cache)
//registerPaymentDashboardHandlers()    →  6 handlers (Tier 1: revenue metrics, cache, receipts)
//registerTier2EventHandlers()          →  4 handlers (notifications, settlement)
//registerInventoryEventHandlers()      →  7 handlers (inventory commit/release/deduct, cache)

app.use("/api", authRoutes);
// app.use("/api/super_admin", superRoutes);
// app.use("/api/admin", adminRoutes);
// app.use("/api/product", productRoutes);

 
startScheduler();
MetricsService.initialize();
 
const httpServer = createServer(app);
const dashboardSocket = new DashboardSocket(httpServer);
 
httpServer.listen(PORT, () => {
  console.log(`☕ Coffee API running on port ${PORT}`);
  console.log(`🔌 WebSocket ready`);
  console.log(`🕒 Cron scheduler active`);
});
