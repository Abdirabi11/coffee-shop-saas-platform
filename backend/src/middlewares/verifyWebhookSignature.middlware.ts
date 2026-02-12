import type { Request, Response, NextFunction } from "express";
import { logWithContext } from "../infrastructure/observability/logger.ts";
import { WebhookVerifier } from "../infrastructure/webhooks/webhookVerifier.ts";

export const webhookSignatureGuard = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
  try {
    const provider = req.path.split("/").pop() || "unknown";
  
    let signature: string | undefined;

    // Different providers use different signature headers
    switch (provider.toLowerCase()) {
      case "stripe":
        signature = req.headers["stripe-signature"] as string;
        break;
      case "evc_plus":
      case "zaad":
      case "edahab":
        signature = req.headers["x-signature"] as string;
        break;
      default:
        signature = req.headers["x-signature"] as string;
    };

    if (!signature) {
      logWithContext("warn", "Webhook rejected - missing signature", {
        provider,
        path: req.path,
      });
      return res.status(401).json({ error: "Missing webhook signature" });
    };

    const event = await WebhookVerifier.verify({
      provider,
      signature,
      rawBody: req.rawBody,
    });

    // Attaching verified event to request for use in controller
    (req as any).webhookEvent = event;
  
    next();
  } catch (error: any) {
    logWithContext("error", "Webhook signature verification failed", {
      error: error.message,
      path: req.path,
    });

    return res.status(401).json({ error: "Invalid webhook signature" });
  }
};


