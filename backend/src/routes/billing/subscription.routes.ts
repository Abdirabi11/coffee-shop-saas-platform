import express from "express"
import { SubscriptionController } from "../../controllers/billing/Subscription.controller.ts";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";
import { requireTenantContext } from "../../middlewares/requireTenantContext.middleware.ts";

const router= express.Router();

router.use(authenticate);
router.use(requireTenantContext);

//GET /api/subscriptions/current
router.get( "/current", authorize(["TENANT_ADMIN", "MANAGER"]), SubscriptionController.getCurrentSubscription );

//POST /api/subscriptions
router.post("/", authorize(["TENANT_ADMIN"]), SubscriptionController.createSubscription );

//POST /api/subscriptions/change-plan
router.post( "/change-plan", authorize(["TENANT_ADMIN"]), SubscriptionController.changePlan );

//POST /api/subscriptions/cancel
router.post("/cancel", authorize(["TENANT_ADMIN"]), SubscriptionController.cancelSubscription);

//POST /api/subscriptions/reactivate
router.post( "/reactivate", authorize(["TENANT_ADMIN"]), SubscriptionController.reactivateSubscription);

//GET /api/subscriptions/quotas
router.get( "/quotas",authorize(["TENANT_ADMIN", "MANAGER"]), SubscriptionController.getQuotas );

//GET /api/subscriptions/features
router.get( "/features", authorize(["TENANT_ADMIN", "MANAGER"]), SubscriptionController.getFeatures );

export default router;
