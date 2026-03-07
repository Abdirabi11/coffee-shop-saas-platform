import express from "express"
import { StaffManagementController } from "../../controllers/staff/StaffManagement.controller.ts";
import { checkAnyPermission, checkPermission } from "../../middlewares/staff/checkPermission.middleware.ts";
import { requireTenantContext } from "../../middlewares/requireTenantContext.middleware.ts";
import { authenticate } from "../../middlewares/auth.middleware.ts";
import { checkStoreRole } from "../../middlewares/staff/checkRole.ts";
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

const router = express.Router();

// STAFF MANAGEMENT

//POST /api/staff
router.post(
  "/",
  authenticate,
  requireTenantContext,
  checkAnyPermission(["staff.create", "staff.manage"]),
  StaffManagementController.createStaff
);

//GET /api/staff/store/:storeUuid
router.get(
  "/store/:storeUuid",
  authenticate,
  checkPermission("staff.read"),
  StaffManagementController.getStoreStaff
);

//GET /api/staff/:userUuid
router.get( "/:userUuid", authenticate, StaffManagementController.getStaffProfile );

//PATCH /api/staff/:userUuid
router.patch(
  "/:userUuid",
  authenticate,
  requireTenantContext,
  checkPermission("staff.update"),
  StaffManagementController.updateStaff
);

//POST /api/staff/:userUuid/store-access
router.post(
  "/:userUuid/store-access",
  authenticate,
  requireTenantContext,
  checkPermission("staff.manage"),
  StaffManagementController.grantStoreAccess
);

//DELETE /api/staff/:userUuid/store-access/:storeUuid
router.delete(
  "/:userUuid/store-access/:storeUuid",
  authenticate,
  requireTenantContext,
  checkPermission("staff.manage"),
  StaffManagementController.revokeStoreAccess
);

//POST /api/staff/auth/pin
router.post( "/auth/pin", StaffManagementController.authenticatePin );

//POST /api/staff/:userUuid/reset-pin
router.post(
  "/:userUuid/reset-pin",
  authenticate,
  checkStoreRole(["STORE_MANAGER", "SHIFT_SUPERVISOR"]),
  StaffManagementController.resetPin
);

//POST /api/staff/:userUuid/terminate
router.post(
  "/:userUuid/terminate",
  authenticate,
  requireTenantContext,
  checkPermission("staff.terminate"),
  StaffManagementController.terminateStaff
);

//TIME ENTRY (CLOCK IN/OUT)

//POST /api/time-entry/clock-in
router.post(
  "/time-entry/clock-in",
  authenticate,
  validateGeofence,
  TimeEntryController.clockIn
);

//POST /api/time-entry/clock-out
router.post(
  "/time-entry/clock-out",
  authenticate,
  validateGeofence,
  TimeEntryController.clockOut
);

//POST /api/time-entry/break/start
router.post( "/time-entry/break/start", authenticate, TimeEntryController.startBreak );

//POST /api/time-entry/break/end
router.post( "/time-entry/break/end", authenticate, TimeEntryController.endBreak );

//GET /api/time-entry/active/:storeUuid
router.get(
  "/time-entry/active/:storeUuid",
  authenticate,
  checkPermission("time_entry.read"),
  TimeEntryController.getActiveTimeEntries
);

//GET /api/time-entry/user/:userUuid
router.get(
  "/time-entry/user/:userUuid",
  authenticate,
  checkAnyPermission(["payroll.read", "time_entry.read"]),
  TimeEntryController.getUserTimeEntries
);

//POST /api/time-entry/:timeEntryUuid/approve
router.post(
  "/time-entry/:timeEntryUuid/approve",
  authenticate,
  checkStoreRole(["STORE_MANAGER", "SHIFT_SUPERVISOR"]),
  TimeEntryController.approveTimeEntry
);

// SHIFT MANAGEMENT

//POST /api/shifts
router.post(
  "/shifts",
  authenticate,
  requireTenantContext,
  checkPermission("shift.create"),
  ShiftManagementController.createShift
);

//GET /api/shifts/store/:storeUuid
router.get(
  "/shifts/store/:storeUuid",
  authenticate,
  checkPermission("shift.read"),
  ShiftManagementController.getStoreShifts
);

//GET /api/shifts/user/:userUuid
router.get( "/shifts/user/:userUuid", authenticate, ShiftManagementController.getUserShifts );

//PATCH /api/shifts/:shiftUuid
router.patch(
  "/shifts/:shiftUuid",
  authenticate,
  checkPermission("shift.update"),
  ShiftManagementController.updateShift
);

//DELETE /api/shifts/:shiftUuid
router.delete(
  "/shifts/:shiftUuid",
  authenticate,
  checkPermission("shift.cancel"),
  ShiftManagementController.cancelShift
);

//POST /api/shifts/:shiftUuid/swap-request
router.post( "/shifts/:shiftUuid/swap-request", authenticate, ShiftManagementController.requestSwap );

//POST /api/shifts/swap/:swapRequestUuid/respond
router.post(
  "/shifts/swap/:swapRequestUuid/respond",
  authenticate,
  checkStoreRole(["STORE_MANAGER", "SHIFT_SUPERVISOR"]),
  ShiftManagementController.respondToSwap
);

//GET /api/shifts/coverage/:storeUuid
router.get(
  "/shifts/coverage/:storeUuid",
  authenticate,
  checkPermission("shift.read"),
  ShiftManagementController.getShiftCoverage
);

// CASH DRAWER

//POST /api/cash-drawer/open
router.post(
  "/cash-drawer/open",
  authenticate,
  requireTenantContext,
  warnIfNotClockedIn,
  CashDrawerController.openDrawer
);

//POST /api/cash-drawer/:drawerUuid/close
router.post( "/cash-drawer/:drawerUuid/close", authenticate, CashDrawerController.closeDrawer );

//POST /api/cash-drawer/:drawerUuid/drop
router.post( "/cash-drawer/:drawerUuid/drop", authenticate, CashDrawerController.cashDrop );

//POST /api/cash-drawer/drop/:cashDropUuid/verify
router.post(
  "/cash-drawer/drop/:cashDropUuid/verify",
  authenticate,
  checkStoreRole(["STORE_MANAGER", "SHIFT_SUPERVISOR"]),
  CashDrawerController.verifyCashDrop
);

//GET /api/cash-drawer/active
router.get( "/cash-drawer/active", authenticate,CashDrawerController.getActiveDrawer );

//GET /api/cash-drawer/history/:storeUuid
router.get(
  "/cash-drawer/history/:storeUuid",
  authenticate,
  checkPermission("cash.view_history"),
  CashDrawerController.getDrawerHistory
);

// OFFLINE SYNC

//GET /api/offline/sync-package
router.get( "/offline/sync-package", authenticate, OfflineSyncController.getSyncPackage );

//POST /api/offline/sync
router.post( "/offline/sync", authenticate, OfflineSyncController.syncActions );

// APPROVALS

//GET /api/approvals/pending/:storeUuid
router.get(
  "/approvals/pending/:storeUuid",
  authenticate,
  checkStoreRole(["STORE_MANAGER", "SHIFT_SUPERVISOR"]),
  ApprovalRequestController.getPendingRequests
);

//POST /api/approvals/:requestUuid/approve
router.post(
  "/approvals/:requestUuid/approve",
  authenticate,
  checkStoreRole(["STORE_MANAGER", "SHIFT_SUPERVISOR"]),
  ApprovalRequestController.approveRequest
);

//POST /api/approvals/:requestUuid/reject
router.post(
  "/approvals/:requestUuid/reject",
  authenticate,
  checkStoreRole(["STORE_MANAGER", "SHIFT_SUPERVISOR"]),
  ApprovalRequestController.rejectRequest
);

//GET /api/approvals/history/:storeUuid
router.get(
  "/approvals/history/:storeUuid",
  authenticate,
  checkPermission("approvals.view_history"),
  ApprovalRequestController.getApprovalHistory
);

//POST /api/tips/record
router.post(
  "/tips/record",
  authenticate,
  TipsAndCommissionController.recordTip
);

//POST /api/tips/calculate-pool
router.post(
  "/tips/calculate-pool",
  authenticate,
  checkStoreRole(["STORE_MANAGER", "SHIFT_SUPERVISOR"]),
  TipsAndCommissionController.calculateTipPool
);

//POST /api/tips/:tipPoolUuid/distribute
router.post(
  "/tips/:tipPoolUuid/distribute",
  authenticate,
  checkStoreRole(["STORE_MANAGER"]),
  TipsAndCommissionController.distributeTips
);

//GET /api/tips/summary/:userUuid
router.get( "/tips/summary/:userUuid", authenticate, TipsAndCommissionController.getTipSummary );

//POST /api/commission/calculate
router.post(
  "/commission/calculate",
  authenticate,
  checkStoreRole(["STORE_MANAGER"]),
  TipsAndCommissionController.calculateCommission
);

//GET /api/commission/summary/:userUuid
router.get(
  "/commission/summary/:userUuid",
  authenticate,
  TipsAndCommissionController.getCommissionSummary
);

// PAYROLL

//POST /api/payroll/calculate
router.post(
  "/payroll/calculate",
  authenticate,
  requireTenantContext,
  checkPermission("payroll.calculate"),
  PayrollExportController.calculatePayroll
);

//POST /api/payroll/:payrollPeriodUuid/approve
router.post(
  "/payroll/:payrollPeriodUuid/approve",
  authenticate,
  checkPermission("payroll.approve"),
  PayrollExportController.approvePayroll
);

//POST /api/payroll/:payrollPeriodUuid/export
router.post(
  "/payroll/:payrollPeriodUuid/export",
  authenticate,
  checkPermission("payroll.export"),
  PayrollExportController.exportPayroll
);

// LABOR COST TRACKING

//POST /api/labor-cost/budget
router.post(
  "/labor-cost/budget",
  authenticate,
  requireTenantContext,
  checkStoreRole(["STORE_MANAGER"]),
  LaborCostTrackingController.setLaborBudget
);

//GET /api/labor-cost/dashboard/:storeUuid
router.get(
  "/labor-cost/dashboard/:storeUuid",
  authenticate,
  checkPermission("labor_cost.read"),
  LaborCostTrackingController.getDashboard
);

//GET /api/labor-cost/trends/:storeUuid
router.get(
  "/labor-cost/trends/:storeUuid",
  authenticate,
  checkPermission("labor_cost.read"),
  LaborCostTrackingController.getTrends
);

// BREAK ENFORCEMENT

//POST /api/break-policies/standard
router.post(
  "/break-policies/standard",
  authenticate,
  requireTenantContext,
  checkStoreRole(["STORE_MANAGER"]),
  BreakEnforcementController.createStandardPolicies
);

//GET /api/break-enforcement/check/:timeEntryUuid
router.get(
  "/break-enforcement/check/:timeEntryUuid",
  authenticate,
  BreakEnforcementController.checkBreakRequirement
);

//GET /api/break-enforcement/violations/:storeUuid
router.get(
  "/break-enforcement/violations/:storeUuid",
  authenticate,
  checkPermission("break.view_violations"),
  BreakEnforcementController.getViolations
);

//POST /api/break-enforcement/violations/:violationUuid/acknowledge
router.post(
  "/break-enforcement/violations/:violationUuid/acknowledge",
  authenticate,
  checkStoreRole(["STORE_MANAGER", "SHIFT_SUPERVISOR"]),
  BreakEnforcementController.acknowledgeViolation
);

//POST /api/break-enforcement/violations/:violationUuid/waive
router.post(
  "/break-enforcement/violations/:violationUuid/waive",
  authenticate,
  checkStoreRole(["STORE_MANAGER"]),
  BreakEnforcementController.waiveViolation
);

// ORDER ATTRIBUTION

//POST /api/orders/:orderUuid/attribution
router.post(
  "/orders/:orderUuid/attribution",
  authenticate,
  OrderAttributionController.attributeOrder
);

//POST /api/orders/:orderUuid/taken-by
router.post( "/orders/:orderUuid/taken-by", authenticate, OrderAttributionController.setTakenBy );

//POST /api/orders/:orderUuid/prepared-by
router.post( "/orders/:orderUuid/prepared-by", authenticate, OrderAttributionController.addPreparedBy );

//POST /api/orders/:orderUuid/served-by
router.post( "/orders/:orderUuid/served-by", authenticate, OrderAttributionController.setServedBy );

//GET /api/orders/stats/:userUuid
router.get( "/orders/stats/:userUuid", authenticate, OrderAttributionController.getStaffOrderStats );

//GET /api/orders/top-performers/:storeUuid
router.get(
  "/orders/top-performers/:storeUuid",
  authenticate,
  checkPermission("reports.view"),
  OrderAttributionController.getTopPerformers
);

export default router;
