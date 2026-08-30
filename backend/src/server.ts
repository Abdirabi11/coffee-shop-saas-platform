import dotenv from "dotenv";

dotenv.config();  

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { createServer } from "http";
import authRoutes from "./routes/auth/auth.routes.ts"
import tenantRoutes from "./routes/tenant/tenant.routes.ts"
import storeRoutes from "./routes/store/store.routes.ts"
import menuRoutes from "./routes/menu/menu.routes.ts"
import menuAdminRoutes from "./routes/menu/menuAdmin.routes.ts";
import staffRoutes from "./routes/staff/staff.routes.ts";
import orderRoutes from "./routes/order/order.routes.ts"
import paymentRoutes from "./routes/payment/Payment.routes.ts";
import cashierPaymentRoutes from "./routes/payment/CashierPayment.routes.ts";
import financialRoutes from "./routes/payment/Financial.routes.ts";
import { startScheduler } from "./jobs/scheduler.ts"
import { MetricsService } from "./infrastructure/observability/MetricsService.ts";
import { compressionMiddleware } from "./middlewares/compression.middleware.ts";
import { corsMiddleware } from "./middlewares/cors.middleware.ts";
import { securityHeadersMiddleware } from "./middlewares/securityHeaders.middleware.ts";
import { requestIdMiddleware } from "./middlewares/requestId.middleware.ts";
import { traceContext } from "./middlewares/traceContext.ts";
import { responseTimeMiddleware } from "./middlewares/responseTime.middleware.ts";
import { rawBodyParser } from "./middlewares/rawBodyParser.middleware.ts";
import { sanitizeInput } from "./middlewares/sanitization.middleware.ts";
import { maintenanceGuard } from "./middlewares/maintainence.ts";
import { deviceFingerprintMiddleware } from "./middlewares/deviceFingerprint.middleware.ts";
import { notFoundHandler, errorHandler } from "./middlewares/errorHandler.middleware.ts";
import webhookRoutes from "./routes/webhooks/webhook.routes.ts";
import webhookAdminRoutes from "./routes/webhooks/webhookAdmin.routes.ts";
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

// Stripe requires the exact, unparsed request bytes to verify its signature.
// This must run BEFORE the global JSON body parser below — once express.json()
// consumes the stream for this path, the raw bytes are gone for good.
app.use("/api/payments/webhooks/stripe", rawBodyParser);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

app.use(requestIdMiddleware);
app.use(traceContext);
app.use(responseTimeMiddleware);

app.use(sanitizeInput);

app.use(maintenanceGuard);
 
app.use(deviceFingerprintMiddleware);

//SECURITY & INFRASTRUCTURE
app.use(corsMiddleware);

//PUBLIC ROUTES (No auth)
// app.use("/api/public", publicRoutes);

// AUTHENTICATED ROUTES
// app.use("/api", [
//   authenticate,
//   requireTenantContext,
//   ensureTenantIsolation,
//   trackTenantUsage,
//   auditLogMiddleware,
//   protectedRoutes,
// ]);

//registerPaymentEventHandlers()        → 12 handlers (fraud, alerts, metrics)
//registerSuperAdminDashboardHandlers() → 12 handlers (super admin cache)
//registerPaymentDashboardHandlers()    →  6 handlers (Tier 1: revenue metrics, cache, receipts)
//registerTier2EventHandlers()          →  4 handlers (notifications, settlement)
//registerInventoryEventHandlers()      →  7 handlers (inventory commit/release/deduct, cache)

app.use("/api", authRoutes);
app.use("/api/store", storeRoutes);
app.use("/api/tenant", tenantRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/admin/menu", menuAdminRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/cashier", cashierPaymentRoutes);
app.use("/api/financial", financialRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/admin/webhooks", webhookAdminRoutes);

// app.use("/api/super_admin", superRoutes);
// app.use("/api/admin", adminRoutes);
// app.use("/api/product", productRoutes);

//UNMATCHED ROUTES
app.use(notFoundHandler);

//ERROR HANDLER (must be registered last)
app.use(errorHandler);


startScheduler();
MetricsService.initialize();
 
const httpServer = createServer(app);
const dashboardSocket = new DashboardSocket(httpServer);
 
httpServer.listen(PORT, () => {
  console.log(`☕ Coffee API running on port ${PORT}`);
  console.log(`🔌 WebSocket ready`);
  console.log(`🕒 Cron scheduler active`);
});
