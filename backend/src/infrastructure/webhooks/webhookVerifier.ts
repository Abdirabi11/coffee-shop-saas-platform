import crypto from "crypto";
import Stripe from "stripe";

interface VerifyParams {
  provider: string;
  signature: string;
  rawBody: Buffer;
}

export class WebhookVerifier {
  static async verify({ provider, signature, rawBody }: VerifyParams): Promise<any> {
    if (!signature) {
      throw new Error("MISSING_WEBHOOK_SIGNATURE");
    }

    switch (provider.toLowerCase()) {
      case "stripe":
        return this.verifyStripe(signature, rawBody);
      
      case "evc_plus":
        return this.verifyEVC(signature, rawBody);
      
      default:
        throw new Error(`UNSUPPORTED_PROVIDER: ${provider}`);
    }
  }

  //Verify Stripe webhook signature ( Stripe SDK)
  private static async verifyStripe(signature: string, rawBody: Buffer): Promise<any> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error("STRIPE_WEBHOOK_SECRET_MISSING");
    };

    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2024-11-20.acacia",
      });

      // Use Stripe's built-in verification (best practice)
      const event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        secret
      );

      return event;
    } catch (error: any) {
      throw new Error(`STRIPE_WEBHOOK_VERIFICATION_FAILED: ${error.message}`);
    }
  }
  
  private static async verifyEVC(signature: string, rawBody: Buffer): Promise<any> {
    const secret = process.env.EVC_PLUS_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error("EVC_WEBHOOK_SECRET_MISSING");
    }

    const computed = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    if (!crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))) {
      throw new Error("EVC_WEBHOOK_SIGNATURE_INVALID");
    }

    return JSON.parse(rawBody.toString());
  }
}