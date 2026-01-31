import crypto from "crypto";
import Stripe from "stripe"

interface VerifyParams {
  provider: "stripe";
  signature: string;
  rawBody: Buffer;
}

export class WebhookVerifier{
    static async verify({provider, signature, rawBody}: VerifyParams) {
      if (!signature) {
          throw new Error("Missing webhook signature");
      };

      switch(provider){
        case "stripe": 
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
            apiVersion: "2023-10-16",
          });

          return stripe.webhooks.constructEvent(
            rawBody,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET!
          );
      }
    }

    private async verifyStripe(signature: string, rawBody: Buffer){
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET_MISSING");

        const elements= signature.split(".")
        const timestamp= elements.find(e => e.startsWith("t="))?.split("=")[1];
        const sig = elements.find(e => e.startsWith("v1="))?.split("=")[1];

        if (!timestamp || !sig) throw new Error("INVALID_SIGNATURE");

        const payload = `${timestamp}.${rawBody.toString()}`;

        const expectedSig= crypto
          .createHmac("sha256", secret)
          .update(payload)
          .digest("hex")
        
        if (
            !crypto.timingSafeEqual(
              Buffer.from(sig),
              Buffer.from(expectedSig)
            )
        ) {
            throw new Error("WEBHOOK_SIGNATURE_INVALID");
        }

        return JSON.parse(rawBody.toString());
    }
}