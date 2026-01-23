import crypto from "crypto";

export function verifyWebhookSignature(
  provider: string,
  payload: any,
  signature?: string
) {
  if (!signature) throw new Error("Missing webhook signature");

  const secret = process.env.STRIPE_WEBHOOK_SECRET!;
  const computed = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");

  if (computed !== signature) {
    throw new Error("Invalid webhook signature");
  }
}