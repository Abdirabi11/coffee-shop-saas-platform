import express from "express";
import {
    listPlans, createPlan, updatePlan, disablePlan, enablePlan, migratePlan, deactivatePlan, createPlanVersion,
    calculateMonthlyBill, resolveTenantLimits
} from "../../controllers/super-admin/plans.controller.ts"
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";

const router= express.Router();

router.use(authenticate, authorize("SUPER_ADMIN"));

router.get("/plans", listPlans);
router.post("/plans", createPlan); 
router.post("/plans/plan-version/:planUuid", createPlanVersion);
router.patch("/plans/:planUuid", updatePlan);
router.patch("/plans/disable/:planUuid", disablePlan);
router.patch("/plans/enable/:planUuid", enablePlan);
router.patch("/subscriptions/:tenantUuid/migrate", migratePlan);
router.get("/plans/calculate", calculateMonthlyBill);
router.get("/plans/resolve", resolveTenantLimits);

// Controller Responsibilities
// Create pricing plans
// Set limits (stores, staff, orders, features)
// Enable / disable plans
// Control plan visibility
// Example features:
// Max staff
// Order analytics
// Multiple branches
// Advanced reports

export default router;