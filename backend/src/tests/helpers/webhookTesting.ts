import crypto from "crypto";

export class WebhookTestHelper {
  
    /**
     * Generate Stripe webhook signature
     */
    static generateStripeSignature(payload: any, secret: string): string {
        const timestamp = Math.floor(Date.now() / 1000);
        const payloadString = JSON.stringify(payload);
        const signedPayload = `${timestamp}.${payloadString}`;
        
        const signature = crypto
            .createHmac("sha256", secret)
            .update(signedPayload)
            .digest("hex");

        return `t=${timestamp},v1=${signature}`;
    }

    /**
     * Generate EVC webhook signature
     */
    static generateEVCSignature(payload: any, secret: string): string {
        return crypto
            .createHmac("sha256", secret)
            .update(JSON.stringify(payload))
            .digest("hex");
    }

    /**
     * Create mock Stripe event
     */
    static createStripeEvent(type: string, data: any) {
        return {
            id: `evt_${crypto.randomBytes(16).toString("hex")}`,
            type,
            data: {
                object: data,
            },
            created: Math.floor(Date.now() / 1000),
            livemode: false,
        };
    }

    /**
     * Create mock EVC event
     */
    static createEVCEvent(status: string, reference: string, amount: number) {
        return {
            transaction_id: crypto.randomUUID(),
            reference,
            status,
            amount,
            currency: "USD",
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Test webhook endpoint
     */
    static async testWebhookEndpoint(url: string, payload: any, signature: string) {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Webhook-Signature": signature,
            },
            body: JSON.stringify(payload),
        });

        return {
            status: response.status,
            body: await response.json().catch(() => null),
        };
    }
}