import express from "express"
import { StaffManagementController } from "../../controllers/staff/StaffManagement.controller.ts";
import { checkAnyPermission, checkPermission } from "../../middlewares/staff/checkPermission.middleware.ts";
import { requireTenantContext } from "../../middlewares/requireTenantContext.middleware.ts";
import { authenticate, storeOf } from "../../middlewares/auth.middleware.ts";
import { checkRole } from "../../middlewares/checkRole.middleware.ts";
import { checkStoreRole } from "../../middlewares/staff/checkRole.middleware.ts";
import { checkPayrollPermission } from "../../middlewares/staff/payrollAccess.middleware.ts";
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
 
// Access is checked in the handler: the target must be a member of this
// tenant, and the caller themselves, a tenant admin, or hold staff.read at a
// store the target works at. Returns safe profile fields only.
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
 
// Access is checked in the handler (tenant member; the user themselves, a
// tenant admin, or time_entry.read / payroll.read at the entries' stores).
// Pay only to the user themselves and tenant admins.
router.get("/time-entry/user/:userUuid", TimeEntryController.getUserTimeEntries);
 
// Staff record routes check roles and permissions at the record's own store
// (storeOf.record), never a client-supplied storeUuid
const SUPERVISOR_ROLES = ["SHIFT_SUPERVISOR", "MANAGER", "STORE_MANAGER", "ADMIN", "TENANT_ADMIN"];
const MANAGER_ROLES = ["MANAGER", "STORE_MANAGER", "ADMIN", "TENANT_ADMIN"];
const STAFF_ROLES = ["CASHIER", "BARISTA", "KITCHEN_STAFF", "STAFF", ...SUPERVISOR_ROLES];

router.post(
    "/time-entry/:timeEntryUuid/approve",
    checkRole(SUPERVISOR_ROLES, storeOf.record("timeEntry", "timeEntryUuid")),
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
 
// Per-user records (shifts, tips, commission, order stats; time entries
// above): access is checked in the handler (staffRecordScope): tenant
// member; the user themselves, a tenant admin, or the read permission at the
// stores involved. Never a client-chosen store alone.
router.get("/shifts/user/:userUuid", ShiftManagementController.getUserShifts);
 
router.patch(
  "/shifts/:shiftUuid",
  checkPermission("shift.update", storeOf.record("shift", "shiftUuid")),
  ShiftManagementController.updateShift
);
 
router.delete(
  "/shifts/:shiftUuid",
  checkPermission("shift.cancel", storeOf.record("shift", "shiftUuid")),
  ShiftManagementController.cancelShift
);
 
router.post("/shifts/:shiftUuid/swap-request", ShiftManagementController.requestSwap);
 
router.post(
  "/shifts/swap/:swapRequestUuid/respond",
  checkRole(SUPERVISOR_ROLES, storeOf.shiftSwap()),
  ShiftManagementController.respondToSwap
);
 
// ─── CASH DRAWER
 
// Drawer roles are checked at the drawer's own store (storeOf.record /
// storeOf.cashDrop), never a client-supplied storeUuid; the handlers then
// limit non-supervisors to their own drawer. Opening uses the body storeUuid,
// verified to be in the tenant, and always opens the caller's own drawer.
const DRAWER_ROLES = [
    "CASHIER", "BARISTA", "KITCHEN_STAFF", "STAFF", "SHIFT_SUPERVISOR",
    "MANAGER", "STORE_MANAGER", "ADMIN", "TENANT_ADMIN",
];
const DROP_VERIFIER_ROLES = ["SHIFT_SUPERVISOR", "MANAGER", "STORE_MANAGER", "ADMIN", "TENANT_ADMIN"];
// Signing off a cash variance: managers and up only (STORE_MANAGER implies
// MANAGER, OWNER implies ADMIN)
const VARIANCE_APPROVER_ROLES = ["MANAGER", "ADMIN", "TENANT_ADMIN"];
const drawerStore = storeOf.record("cashDrawer", "drawerUuid");

router.post("/cash-drawer/open", warnIfNotClockedIn, checkRole(DRAWER_ROLES), CashDrawerController.openDrawer );
 
router.get("/cash-drawer/active", CashDrawerController.getActiveDrawer);
 
router.get(
  "/cash-drawer/history/:storeUuid",
  checkPermission("cash.view_history"),
  CashDrawerController.getDrawerHistory
);
 
router.post("/cash-drawer/:drawerUuid/close", checkRole(DRAWER_ROLES, drawerStore), CashDrawerController.closeDrawer);
router.post("/cash-drawer/:drawerUuid/drop", checkRole(DRAWER_ROLES, drawerStore), CashDrawerController.cashDrop);
 
router.post(
  "/cash-drawer/:drawerUuid/approve-variance",
  checkRole(VARIANCE_APPROVER_ROLES, drawerStore),
  CashDrawerController.approveCashVariance
);
 
router.post(
  "/cash-drawer/drop/:cashDropUuid/verify",
  checkRole(DROP_VERIFIER_ROLES, storeOf.cashDrop()),
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
 
// Roles at the request's own store; money and access requests also need a
// manager (checked in the handler)
const approvalStore = storeOf.record("staffApprovalRequest", "requestUuid");

router.post(
  "/approvals/:requestUuid/approve",
  checkRole(SUPERVISOR_ROLES, approvalStore),
  ApprovalRequestController.approveRequest
);
 
router.post(
  "/approvals/:requestUuid/reject",
  checkRole(SUPERVISOR_ROLES, approvalStore),
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
  checkRole(MANAGER_ROLES, storeOf.record("tipPool", "tipPoolUuid")),
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
 
// Checked at the period's own store (tenant admins for tenant-wide periods),
// never a client-supplied storeUuid
router.post(
  "/payroll/:payrollPeriodUuid/approve",
  checkPayrollPermission("payroll.approve"),
  PayrollExportController.approvePayroll
);
 
router.post(
  "/payroll/:payrollPeriodUuid/export",
  checkPayrollPermission("payroll.export"),
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
 
// The time entry's owner, or a supervisor at its store (checked in the handler)
router.get("/break-enforcement/check/:timeEntryUuid", BreakEnforcementController.checkBreakRequirement);
 
router.get(
  "/break-enforcement/violations/:storeUuid",
  checkPermission("break.view_violations"),
  BreakEnforcementController.getViolations
);
 
router.post(
  "/break-enforcement/violations/:violationUuid/acknowledge",
  checkRole(SUPERVISOR_ROLES, storeOf.breakViolation()),
  BreakEnforcementController.acknowledgeViolation
);
 
router.post(
  "/break-enforcement/violations/:violationUuid/waive",
  checkRole(MANAGER_ROLES, storeOf.breakViolation()),
  BreakEnforcementController.waiveViolation
);
 
// ─── ORDER ATTRIBUTION
 
// Staff roles at the order's own store; setting all three (and replacing
// someone else's credit) is for supervisors. Named users must be staff there.
// "STAFF" is also the tenant role every member (customers too) holds, so the
// self-attribution routes also need an actual assignment at the order's store
// (checkRole sets req.storeRole only then).
const orderStore = storeOf.order();
const assignedAtOrderStore: express.RequestHandler = (req, res, next) =>
    req.storeRole ? next() : res.status(403).json({ message: "Forbidden", error: "INSUFFICIENT_ROLE" });
const orderStaff = [checkRole(STAFF_ROLES, orderStore), assignedAtOrderStore];
router.post("/orders/:orderUuid/attribution", checkRole(SUPERVISOR_ROLES, orderStore), OrderAttributionController.attributeOrder);
router.post("/orders/:orderUuid/taken-by", ...orderStaff, OrderAttributionController.setTakenBy);
router.post("/orders/:orderUuid/prepared-by", ...orderStaff, OrderAttributionController.addPreparedBy);
router.post("/orders/:orderUuid/served-by", ...orderStaff, OrderAttributionController.setServedBy);
 
router.get("/orders/stats/:userUuid", OrderAttributionController.getStaffOrderStats);
 
router.get(
  "/orders/top-performers/:storeUuid",
  checkPermission("reports.view"),
  OrderAttributionController.getTopPerformers
);

export default router;
