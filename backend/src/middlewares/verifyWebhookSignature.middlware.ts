import type { Request, Response, NextFunction } from "express";
import { verifyWebhookSignature } from "../services/webhookSecurity.service.ts";

export const webhookSignatureGuard = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const signature = req.headers["x-signature"] as string;
    const provider = req.headers["x-provider"] as string;
  
    if (!signature || !provider) {
      return res.status(401).json({ message: "Missing webhook signature" });
    }
  
    const isValid = await verifyWebhookSignature(
      req.rawBody, // important: raw body
      signature,
      provider
    );
  
    if (!isValid) {
      return res.status(401).json({ message: "Invalid webhook signature" });
    }
  
    next();
};


