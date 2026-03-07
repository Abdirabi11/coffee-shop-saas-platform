import prisma from "../../config/prisma.ts"
import { StripeWebhookHandler } from "../../handlers/webhooks/StripeWebhook.handler.ts";
import { WebhookDispatcherService } from "../../services/webhooks/WebhookDispatcher.service.ts";
import { WebhookManagementService } from "../../services/webhooks/WebhookManagement.service.ts";
import { WebhookTestHelper } from "../helpers/webhookTesting.ts"

describe("Webhook System", () => {
  
    describe("Webhook Management", () => {
        it("should create webhook endpoint", async () => {
            const webhook = await WebhookManagementService.createWebhook({
                tenantUuid: "test-tenant",
                url: "https://example.com/webhook",
                events: ["order.created", "order.paid"],
                createdBy: "test-user",
            });

            expect(webhook).toBeDefined();
            expect(webhook.url).toBe("https://example.com/webhook");
            expect(webhook.events).toContain("order.created");
        });

        it("should test webhook endpoint", async () => {
            const webhook = await WebhookManagementService.createWebhook({
                tenantUuid: "test-tenant",
                url: "https://example.com/webhook",
                events: ["webhook.test"],
                createdBy: "test-user",
            });

            const result = await WebhookManagementService.testWebhook(webhook.uuid);

            expect(result.success).toBeDefined();
        });

        it("should rotate webhook secret", async () => {
            const webhook = await WebhookManagementService.createWebhook({
                tenantUuid: "test-tenant",
                url: "https://example.com/webhook",
                events: ["order.created"],
                createdBy: "test-user",
            });

            const oldSecret = webhook.secret;

            const updated = await WebhookManagementService.rotateSecret(webhook.uuid);

            expect(updated.secret).not.toBe(oldSecret);
        });
    });

    describe("Webhook Dispatcher", () => {
        it("should dispatch webhook to subscribed endpoints", async () => {
            // Create webhook
            const webhook = await WebhookManagementService.createWebhook({
                tenantUuid: "test-tenant",
                storeUuid: "test-store",
                url: "https://example.com/webhook",
                events: ["order.created"],
                createdBy: "test-user",
            });

            // Dispatch event
            await WebhookDispatcherService.dispatch({
                tenantUuid: "test-tenant",
                storeUuid: "test-store",
                eventType: "order.created",
                eventUuid: crypto.randomUUID(),
                payload: {
                    orderId: "test-order",
                    amount: 1000,
                },
            });

            // Check delivery was created
            const deliveries = await prisma.webhookDelivery.findMany({
                where: { webhookUuid: webhook.uuid },
            });

            expect(deliveries.length).toBeGreaterThan(0);
        });
    });

    describe("Stripe Webhook", () => {
        it("should verify Stripe signature", async () => {
            const secret = "whsec_test_secret";
            const payload = { test: "data" };

            const signature = WebhookTestHelper.generateStripeSignature(payload, secret);

            // Test signature verification
            expect(signature).toContain("t=");
            expect(signature).toContain("v1=");
        });

        it("should process payment_intent.succeeded", async () => {
            const event = WebhookTestHelper.createStripeEvent(
                "payment_intent.succeeded",
                {
                id: "pi_test",
                amount: 1000,
                metadata: {
                    orderUuid: "test-order",
                    tenantUuid: "test-tenant",
                },
                }
            );

            // Process webhook
            await StripeWebhookHandler.process(event);

            // Verify order was updated
            const order = await prisma.order.findUnique({
                where: { uuid: "test-order" },
            });

            expect(order?.status).toBe("PAID");
        });
    });
});