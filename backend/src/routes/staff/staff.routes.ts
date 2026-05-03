import express from "express"
import { StaffManagementController } from "../../controllers/staff/StaffManagement.controller.ts";
import { checkAnyPermission, checkPermission } from "../../middlewares/staff/checkPermission.middleware.ts";
import { requireTenantContext } from "../../middlewares/requireTenantContext.middleware.ts";
import { authenticate } from "../../middlewares/auth.middleware.ts";
import { checkStoreRole } from "../../middlewares/staff/checkRole.middleware.ts";
import { validateGeofence } from "../../middlewares/staff/validateGeofence.ts";
import { TimeEntryController } from "../../controllers/staff/TimeEntry.controller.ts";
import { ShiftManagementController } from "../../controllers/staff/ShiftManagement.controller.ts";
import { warnIfNotClockedIn } from "../../middlewares/staff/requireClockIn.ts";
import { CashDrawerController } from "../../controllers/staff/CashDrawer.controller.ts";
import { OfflineSyncController } from "../../controllers/staff/OfflineSync.controller.ts";
import { ApprovalRequestController } from "../../controllers/staff/ApprovalRequest.controller.ts";
import { OrderAttributionController } from "../../controllers/staff/OrderAttribution.controller.ts";
import { TipsAndCommissionController } from "../../controllers/staff/TipsAndCommission.controller.ts";
import { PayrollExportController } from "../../controllers/staff/PayrollExport.controller.ts";
import { LaborCostTrackingController } from "../../controllers/staff/LaborCostTracking.controller.ts";
import { BreakEnforcementController } from "../../controllers/staff/BreakEnforcement.controller.ts";
import { rateLimitByIP } from "../../middlewares/menu/Ratelimitbyip.middleware.ts";

const router = express.Router();
 
// All staff routes require auth
router.use(authenticate);
 
router.post(
  "/auth/pin",
  rateLimitByIP({ points: 10, duration: 60 }),
  StaffManagementController.authenticatePin
);
 
router.use(requireTenantContext);
 
// ─── STAFF MANAGEMENT
 
router.post(
  "/",
  checkAnyPermission(["staff.create", "staff.manage"]),
  StaffManagementController.createStaff
);
 
router.get("/store/:storeUuid", checkPermission("staff.read"), StaffManagementController.getStoreStaff );
 
router.patch("/:userUuid", checkPermission("staff.update"), StaffManagementController.updateStaff );
 
router.post(
  "/:userUuid/store-access",
  checkPermission("staff.manage"),
  StaffManagementController.grantStoreAccess
);
 
router.delete(
  "/:userUuid/store-access/:storeUuid",
  checkPermission("staff.manage"),
  StaffManagementController.revokeStoreAccess
);
 
router.post(
  "/:userUuid/reset-pin",
  checkStoreRole(["STORE_MANAGER", "SHIFT_SUPERVISOR"]),
  StaffManagementController.resetPin
);
 
router.post(
  "/:userUuid/terminate",
  checkPermission("staff.terminate"),
  StaffManagementController.terminateStaff
);
 
router.get( "/:userUuid", StaffManagementController.getStaffProfile );
 
// ─── TIME ENTRY 

router.post( "/time-entry/clock-in", validateGeofence, TimeEntryController.clockIn );
router.post( "/time-entry/clock-out", validateGeofence, TimeEntryController.clockOut );
router.post("/time-entry/break/start", TimeEntryController.startBreak);
router.post("/time-entry/break/end", TimeEntryController.endBreak);
 
router.get(
  "/time-entry/active/:storeUuid",
  checkPermission("time_entry.read"),
  TimeEntryController.getActiveTimeEntries
);
 
router.get(
    "/time-entry/user/:userUuid",
    checkAnyPermission(["payroll.read", "time_entry.read"]),
    TimeEntryController.getUserTimeEntries
);
 
router.post(
    "/time-entry/:timeEntryUuid/approve",
    checkStoreRole(["STORE_MANAGER", "SHIFT_SUPERVISOR"]),
    TimeEntryController.approveTimeEntry
);
 
// ─── SHIFT MANAGEMENT 
 
router.post(
  "/shifts",
  checkPermission("shift.create"),
  ShiftManagementController.createShift
);
 
router.get(
  "/shifts/store/:storeUuid",
  checkPermission("shift.read"),
  ShiftManagementController.getStoreShifts
);
 
router.get(
  "/shifts/coverage/:storeUuid",
  checkPermission("shift.read"),
  ShiftManagementController.getShiftCoverage
);
 
router.get("/shifts/user/:userUuid", ShiftManagementController.getUserShifts);
 
router.patch(
  "/shifts/:shiftUuid",
  checkPermission("shift.update"),
  ShiftManagementController.updateShift
);
 
router.delete(
  "/shifts/:shiftUuid",
  checkPermission("shift.cancel"),
  ShiftManagementController.cancelShift
);
 
router.post("/shifts/:shiftUuid/swap-request", ShiftManagementController.requestSwap);
 
router.post(
  "/shifts/swap/:swapRequestUuid/respond",
  checkStoreRole(["STORE_MANAGER", "SHIFT_SUPERVISOR"]),
  ShiftManagementController.respondToSwap
);
 
// ─── CASH DRAWER
 
router.post("/cash-drawer/open", warnIfNotClockedIn, CashDrawerController.openDrawer );
 
router.get("/cash-drawer/active", CashDrawerController.getActiveDrawer);
 
router.get(
  "/cash-drawer/history/:storeUuid",
  checkPermission("cash.view_history"),
  CashDrawerController.getDrawerHistory
);
 
router.post("/cash-drawer/:drawerUuid/close", CashDrawerController.closeDrawer);
router.post("/cash-drawer/:drawerUuid/drop", CashDrawerController.cashDrop);
 
router.post(
  "/cash-drawer/drop/:cashDropUuid/verify",
  checkStoreRole(["STORE_MANAGER", "SHIFT_SUPERVISOR"]),
  CashDrawerController.verifyCashDrop
);
 
// ─── OFFLINE SYNC 
 
router.get("/offline/sync-package", OfflineSyncController.getSyncPackage);
router.post("/offline/sync", OfflineSyncController.syncActions);
 
// ─── APPROVALS
 
router.get(
  "/approvals/pending/:storeUuid",
  checkStoreRole(["STORE_MANAGER", "SHIFT_SUPERVISOR"]),
  ApprovalRequestController.getPendingRequests
);
 
router.post(
  "/approvals/:requestUuid/approve",
  checkStoreRole(["STORE_MANAGER", "SHIFT_SUPERVISOR"]),
  ApprovalRequestController.approveRequest
);
 
router.post(
  "/approvals/:requestUuid/reject",
  checkStoreRole(["STORE_MANAGER", "SHIFT_SUPERVISOR"]),
  ApprovalRequestController.rejectRequest
);
 
router.get(
  "/approvals/history/:storeUuid",
  checkPermission("approvals.view_history"),
  ApprovalRequestController.getApprovalHistory
);
 
// ─── TIPS & COMMISSION 
 
router.post("/tips/record", TipsAndCommissionController.recordTip);
 
router.post(
  "/tips/calculate-pool",
  checkStoreRole(["STORE_MANAGER", "SHIFT_SUPERVISOR"]),
  TipsAndCommissionController.calculateTipPool
);
 
router.post(
  "/tips/:tipPoolUuid/distribute",
  checkStoreRole(["STORE_MANAGER"]),
  TipsAndCommissionController.distributeTips
);
 
router.get("/tips/summary/:userUuid", TipsAndCommissionController.getTipSummary);
 
router.post(
  "/commission/calculate",
  checkStoreRole(["STORE_MANAGER"]),
  TipsAndCommissionController.calculateCommission
);
 
router.get("/commission/summary/:userUuid", TipsAndCommissionController.getCommissionSummary);
 
// ─── PAYROLL
 
router.post(
  "/payroll/calculate",
  checkPermission("payroll.calculate"),
  PayrollExportController.calculatePayroll
);
 
router.post(
  "/payroll/:payrollPeriodUuid/approve",
  checkPermission("payroll.approve"),
  PayrollExportController.approvePayroll
);
 
router.post(
  "/payroll/:payrollPeriodUuid/export",
  checkPermission("payroll.export"),
  PayrollExportController.exportPayroll
);
 
// ─── LABOR COST
 
router.post(
  "/labor-cost/budget",
  checkStoreRole(["STORE_MANAGER"]),
  LaborCostTrackingController.setLaborBudget
);
 
router.get(
  "/labor-cost/dashboard/:storeUuid",
  checkPermission("labor_cost.read"),
  LaborCostTrackingController.getDashboard
);
 
router.get(
  "/labor-cost/trends/:storeUuid",
  checkPermission("labor_cost.read"),
  LaborCostTrackingController.getTrends
);
 
// ─── BREAK ENFORCEMENT
 
router.post(
  "/break-policies/standard",
  checkStoreRole(["STORE_MANAGER"]),
  BreakEnforcementController.createStandardPolicies
);
 
router.get("/break-enforcement/check/:timeEntryUuid", BreakEnforcementController.checkBreakRequirement);
 
router.get(
  "/break-enforcement/violations/:storeUuid",
  checkPermission("break.view_violations"),
  BreakEnforcementController.getViolations
);
 
router.post(
  "/break-enforcement/violations/:violationUuid/acknowledge",
  checkStoreRole(["STORE_MANAGER", "SHIFT_SUPERVISOR"]),
  BreakEnforcementController.acknowledgeViolation
);
 
router.post(
  "/break-enforcement/violations/:violationUuid/waive",
  checkStoreRole(["STORE_MANAGER"]),
  BreakEnforcementController.waiveViolation
);
 
// ─── ORDER ATTRIBUTION
 
router.post("/orders/:orderUuid/attribution", OrderAttributionController.attributeOrder);
router.post("/orders/:orderUuid/taken-by", OrderAttributionController.setTakenBy);
router.post("/orders/:orderUuid/prepared-by", OrderAttributionController.addPreparedBy);
router.post("/orders/:orderUuid/served-by", OrderAttributionController.setServedBy);
 
router.get("/orders/stats/:userUuid", OrderAttributionController.getStaffOrderStats);
 
router.get(
  "/orders/top-performers/:storeUuid",
  checkPermission("reports.view"),
  OrderAttributionController.getTopPerformers
);

export default router;
