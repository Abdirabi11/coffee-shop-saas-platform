import express from "express"
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";
import { PlanController } from "../../controllers/billing/Plan.controller.ts";

const router= express.Router();

// PUBLIC PLAN ROUTES (No auth)

router.get("/", PlanController.listPlans);

//GET /api/plans/slug/:slug
router.get("/slug/:slug", PlanController.getPlanBySlug);

//GET /api/plans/:planUuid
router.get("/:planUuid", PlanController.getPlan);

//POST /api/plans/compare
router.post("/compare", PlanController.comparePlans);

// ADMIN PLAN MANAGEMENT (SUPER_ADMIN only)

router.use(authenticate);

//POST /api/plans
router.post( "/", authorize(["SUPER_ADMIN"]), PlanController.createPlan );

//PATCH /api/plans/:planUuid
router.patch( "/:planUuid", authorize(["SUPER_ADMIN"]), PlanController.updatePlan );

//POST /api/plans/:planUuid/enable
router.post( "/:planUuid/enable", authorize(["SUPER_ADMIN"]), PlanController.enablePlan );

///POST /api/plans/:planUuid/disable
router.post( "/:planUuid/disable", authorize(["SUPER_ADMIN"]), PlanController.disablePlan );

//POST /api/plans/:planUuid/prices
router.post(
  "/:planUuid/prices",
  authorize(["SUPER_ADMIN"]),
  PlanController.addPlanPrice
);

//POST /api/plans/:planUuid/features
router.post( "/:planUuid/features", authorize(["SUPER_ADMIN"]), PlanController.addPlanFeature );

//POST /api/plans/:planUuid/quotas
router.post( "/:planUuid/quotas", authorize(["SUPER_ADMIN"]), PlanController.addPlanQuota );

//POST /api/plans/:planUuid
router.post( "/:planUuid/versions", authorize(["SUPER_ADMIN"]), PlanController.createPlanVersion );

//GET /api/plans/:planUuid/analytics
router.get( "/:planUuid/analytics", authorize(["SUPER_ADMIN"]), PlanController.getPlanAnalytics );

export default router;