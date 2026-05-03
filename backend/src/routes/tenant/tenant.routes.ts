import express from "express"
import { requireTenantContext } from "../../middlewares/requireTenantContext.middleware.ts";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";
import { rateLimitByIP } from "../../middlewares/menu/Ratelimitbyip.middleware.ts";
import { TenantController } from "../../controllers/tenant/Tenant.controller.ts";
import { TenantSecurityController } from "../../controllers/tenant/TenantSecurity.controller.ts";
import { TenantStaffController } from "../../controllers/tenant/TenantStaff.controller.ts";


const router = express.Router();
 
// All tenant routes require auth + tenant context
router.use(authenticate);
router.use(requireTenantContext);
router.use(rateLimitByIP({ points: 60, duration: 60 }));
 
// ─── Dashboard (ADMIN, MANAGER) ────────────────────────────
router.get("/dashboard", authorize("OWNER", "ADMIN", "MANAGER"), TenantController.getDashboard);
router.get("/overview", authorize("OWNER", "ADMIN", "MANAGER"), TenantController.getOverview);
router.get("/stores/performance", authorize("OWNER", "ADMIN", "MANAGER"), TenantController.getStorePerformance);
router.get("/products/top", authorize("OWNER", "ADMIN", "MANAGER"), TenantController.getTopProducts);
router.get("/revenue/trend", authorize("OWNER", "ADMIN", "MANAGER"), TenantController.getRevenueTrend);
router.get("/customers", authorize("OWNER", "ADMIN", "MANAGER"), TenantController.getCustomerInsights);
router.get("/orders/active", authorize("OWNER", "ADMIN", "MANAGER"), TenantController.getActiveOrders);
router.get("/payments/failed", authorize("OWNER", "ADMIN", "MANAGER"), TenantController.getFailedPayments);
 
// ─── Analytics (ADMIN+) ─────────────────────────────────────
router.get("/analytics/revenue", authorize("OWNER", "ADMIN"), TenantController.getRevenueAnalytics);
router.get("/analytics/payment-methods", authorize("OWNER", "ADMIN"), TenantController.getPaymentMethodBreakdown);
router.get("/analytics/peak-hours", authorize("OWNER", "ADMIN"), TenantController.getPeakHours);
router.get("/analytics/day-of-week", authorize("OWNER", "ADMIN"), TenantController.getDayOfWeek);
router.get("/analytics/stores/compare", authorize("OWNER", "ADMIN"), TenantController.getStoreComparison);
router.get("/analytics/customers", authorize("OWNER", "ADMIN"), TenantController.getCustomerAnalytics);
 
// ─── Billing & Subscription (OWNER, ADMIN) ──────────────────
router.get("/subscription", authorize("OWNER", "ADMIN"), TenantController.getSubscription);
router.get("/invoices", authorize("OWNER", "ADMIN"), TenantController.listInvoices);
router.get("/invoices/:invoiceUuid/download", authorize("OWNER", "ADMIN"), TenantController.downloadInvoice);
 
// ─── Staff Management (OWNER, ADMIN) ────────────────────────
router.get("/staff", authorize("OWNER", "ADMIN", "MANAGER"), TenantStaffController.listStaff);
router.post("/staff/invite", authorize("OWNER", "ADMIN"), TenantStaffController.inviteStaff);
router.patch("/staff/:staffUuid", authorize("OWNER", "ADMIN"), TenantStaffController.updateStaff);
router.delete("/staff/:staffUuid", authorize("OWNER", "ADMIN"), TenantStaffController.removeStaff);
router.get("/staff/invitations", authorize("OWNER", "ADMIN"), TenantStaffController.listInvitations);
router.delete("/staff/invitations/:invitationUuid", authorize("OWNER", "ADMIN"), TenantStaffController.revokeInvitation);
 
// ─── Security (OWNER, ADMIN) ────────────────────────────────
router.get( "/security/overview", authorize("OWNER", "ADMIN"), TenantSecurityController.getOverview);
router.get( "/security/sessions", authorize("OWNER", "ADMIN"), TenantSecurityController.getSessions);
router.get( "/security/fraud-events", authorize("OWNER", "ADMIN"), TenantSecurityController.getFraudEvents);
router.get( "/security/audit-logs", authorize("OWNER", "ADMIN"), TenantSecurityController.getAuditLogs);
router.post("/security/sessions/:sessionUuid/revoke", authorize("OWNER", "ADMIN"), TenantSecurityController.revokeSession);
router.post("/security/users/:userUuid/force-logout", authorize("OWNER", "ADMIN"), TenantSecurityController.forceLogoutUser);
 
export default router;