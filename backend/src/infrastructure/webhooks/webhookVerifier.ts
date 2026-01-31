import crypto from "crypto";

export function verifyWebhookSignature(
  payload: Buffer,
  signature: string,
  secret: string
) {
  const computed = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  if (computed !== signature) {
    throw new Error("INVALID_WEBHOOK_SIGNATURE");
  }
}