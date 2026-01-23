import crypto from "crypto";

export const hashSecret = (secret: string) =>
crypto.createHash("sha256").update(secret).digest("hex");


// When creating or rotating webhook secrets
// WebhookSecretService.rotate(...)