import express from "express";
import {
    listPlans, createPlan, updatePlan, disablePlan, enablePlan, migratePlan, deactivatePlan
} from "../../controllers/super-admin/plans.controller.ts"

const router= express.Router();

router.get("/plans", listPlans);
router.post("/plans", createPlan);
router.patch("/plans/:planUuid", updatePlan);
router.patch("/plans/:planUuid", disablePlan);
router.patch("/plans/:planUuid", enablePlan);
router.delete("/plans/:planUuid", deactivatePlan);

router.get("/plans", getPlans);
router.post("/plans", createPlan);
router.patch("/plans/:planUuid", updatePlan);
router.delete("/plans/:planUuid", deactivatePlan); // NOT hard delete

router.patch("/subscriptions/:tenantUuid/migrate", migratePlan);

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