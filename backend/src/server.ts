import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import "@/events/listeners/cache.listener";
import helmet from "helmet";
import superRoutes from "./routes/super-admin/super_admin.auth.routes.ts"
import adminRoutes from "./routes/admin/admin.routes.ts"
import authRoutes from "./routes/auth.routes.ts"
import productRoutes from "./routes/product.routes.ts"
import { startScheduler } from "./lib/cron/scheduler.ts";
import { MetricsService } from "./infrastructure/observability/metricsService.ts";
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
import { webhookRateLimit } from "./middlewares/webhookRateLimit.middleware.ts";
import { preventReplayAttack } from "./middlewares/replayProtection.middleware.ts";
import { webhookSignatureGuard } from "./middlewares/verifyWebhookSignature.middlware.ts";
import { authenticate } from "./middlewares/auth.middleware.ts";
import { requireTenantContext } from "./middlewares/requireTenantContext.middleware.ts";
import { ensureTenantIsolation } from "./middlewares/ensureTenantIsolation.ts";
import { trackTenantUsage } from "./middlewares/tenantUsageTracking.ts";
import { auditLogMiddleware } from "./middlewares/auditLog.middleware.ts";



dotenv.config();

const app = express();
const PORT: number = Number(process.env.PORT) || 5004;

app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//SECURITY & INFRASTRUCTURE
app.use(securityHeadersMiddleware);
app.use(corsMiddleware);
app.use(compressionMiddleware);
app.use(helmet());

//LOGGING & TRACKING
app.use(requestIdMiddleware);
app.use(traceContext);
app.use(responseTimeMiddleware);

//BODY PARSING
app.use(rawBodyMiddleware); // For webhooks
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));


//SANITIZATION
app.use(sanitizeInput);

//MAINTENANCE MODE CHECK
app.use(maintenanceGuard);

//DEVICE FINGERPRINTING
app.use(deviceFingerprintMiddleware);

app.use( "/api/payments", express.raw({ type: "application/json" }) );

//PUBLIC ROUTES (No auth)
app.use("/api/public", publicRoutes);

// WEBHOOK ROUTES (Special handling)
app.use(
  "/api/webhooks",
  webhookRateLimit,
  preventReplayAttack,
  webhookSignatureGuard,
  webhookRoutes
);

// AUTHENTICATED ROUTES
app.use("/api", [
  authenticate,
  requireTenantContext,
  ensureTenantIsolation,
  trackTenantUsage,
  auditLogMiddleware,
  protectedRoutes,
]);

//ERROR HANDLER (Last)
app.use(errorHandler);

app.use("/api/auth", authRoutes);
app.use("/api/super_admin", superRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/product", productRoutes);

startScheduler();
MetricsService.initialize();

app.listen(PORT, () => {
  console.log(`☕ Coffee API running on port ${PORT}`);
  console.log(`🕒 Cron scheduler active`);
});
