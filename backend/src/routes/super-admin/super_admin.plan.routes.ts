import express from "express";
import {getPlans, createPlan, updatePlan, cancelPlan} from "../../controllers/super-admin/plans.controller.ts"

const router= express.Router();


router.get("/plans", getPlans);
router.post("/plans", createPlan);
router.patch("/plans/:planUuid", updatePlan);
router.delete("/plans/:planUuid", cancelPlan);

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