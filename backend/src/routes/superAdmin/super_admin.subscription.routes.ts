import express from "express";
import { subscribe, getSubs, getSingleSubs, updateSubs, cancelSubs, overrideSubscription, migrateSubscription
} from "../../controllers/super-admin/subscriptions.controller.ts"
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";

const router= express.Router()

router.use(authenticate, authorize("SUPER_ADMIN"));

router.post("/subscriptions/:tenantUuid", subscribe);
router.get("/subscriptions", getSubs);
router.get("/subscriptions/:tenantUuid", getSingleSubs);
router.patch("/subscriptions/:tenantUuid", updateSubs);
router.post("/subscriptions/:tenantUuid/cancel", cancelSubs);
router.patch("/subscriptions/:tenantUuid/override", overrideSubscription);


router.patch("/subscriptions/:tenantUuid/migrate", migrateSubscription);


export default router;

// Controller Responsibilities
// View tenant subscriptions
// Change plan manually
// Cancel subscription
// Extend trial
// Handle failed payments
// 🧠 Stripe webhook updates subscription status
// Super Admin can override manually.


// Change plan manually

// Cancel subscription

// Extend trial

// Handle failed payments