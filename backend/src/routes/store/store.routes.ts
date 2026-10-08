import express from "express"
import { requireTenantContext } from "../../middlewares/requireTenantContext.middleware.ts";
import { authenticate, authorize, authorizeStore } from "../../middlewares/auth.middleware.ts";
import { StoreController } from "../../controllers/store/Store.controller.ts";
import { rateLimitByIP } from "../../middlewares/menu/Ratelimitbyip.middleware.ts";



const router = express.Router();
 
// All store routes require auth + tenant context
router.use(authenticate);
router.use(requireTenantContext);
router.use(rateLimitByIP({ points: 60, duration: 60 }));
 
// ─── Store List & Info ──────────────────────────────────────
// Tenant-wide list: tenant-level roles only (authorize). Everything under
// /:storeUuid is store scope (authorizeStore): the handler acts on that store.
router.get("/", authorize("OWNER", "ADMIN", "MANAGER"),  StoreController.listStores);
router.get("/:storeUuid", authorizeStore("OWNER", "ADMIN", "MANAGER"),  StoreController.getStore);
router.get("/:storeUuid/hours/status/public", StoreController.getOpenStatus);

 
// ─── Dashboard & Metrics (MANAGER+) ────────────────────────
router.get("/:storeUuid/dashboard", authorizeStore("OWNER", "ADMIN", "MANAGER"),  StoreController.getDashboard);
router.get("/:storeUuid/metrics/today", authorizeStore("OWNER", "ADMIN", "MANAGER"),  StoreController.getTodayMetrics);
router.get("/:storeUuid/metrics/range", authorizeStore("OWNER", "ADMIN", "MANAGER"),  StoreController.getMetricsRange);
router.get("/:storeUuid/orders/active", authorizeStore("OWNER", "ADMIN", "MANAGER", "CASHIER"), StoreController.getActiveOrders);
 
// ─── Store Hours ────────────────────────────────────────────
router.get("/:storeUuid/hours", authorizeStore("OWNER", "ADMIN", "MANAGER"),  StoreController.getHours);
router.get("/:storeUuid/hours/status", authorizeStore("OWNER", "ADMIN", "MANAGER", "CASHIER"), StoreController.getOpenStatus);
router.put("/:storeUuid/hours", authorizeStore("OWNER", "ADMIN"), StoreController.setHours);
router.put("/:storeUuid/hours/bulk", authorizeStore("OWNER", "ADMIN"), StoreController.setBulkHours);
 
// ─── Hour Exceptions (holidays, closures) ───────────────────
router.get("/:storeUuid/hours/exceptions", authorizeStore("OWNER", "ADMIN", "MANAGER"), StoreController.getExceptions);
router.post("/:storeUuid/hours/exceptions", authorizeStore("OWNER", "ADMIN"), StoreController.addException);
router.delete("/:storeUuid/hours/exceptions/:exceptionUuid", authorizeStore("OWNER", "ADMIN"), StoreController.removeException);
 
export default router;