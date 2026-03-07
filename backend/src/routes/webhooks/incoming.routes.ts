import express from "express";

const router = express.Router();

/**
 * POST /webhooks/stripe
 * Stripe webhook endpoint
 * 
 * IMPORTANT: Use express.raw() for Stripe signature verification
 */
router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  StripeWebhookController.handle
);

/**
 * POST /webhooks/evc-plus
 * EVC Plus webhook endpoint
 */
router.post(
  "/evc-plus",
  express.raw({ type: "application/json" }),
  EVCWebhookController.handle
);

export default router;
