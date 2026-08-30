import { OrderCommandService } from "../services/order/OrderCommand.service.js";
import { WebhookManagementService } from "../services/webhooks/WebhookManagement.service.ts";

async function webhookIntegrationExample() {
  
    // 1. Tenant creates webhook endpoint
    const webhook = await WebhookManagementService.createWebhook({
        tenantUuid: "tenant-123",
        storeUuid: "store-456",
        url: "https://myapp.com/webhooks/orders",
        events: [
            "order.created",
            "order.paid",
            "order.completed",
            "order.cancelled",
        ],
        description: "Production order webhook",
        ipWhitelist: [], // Empty = allow all
        headers: {
            "X-Custom-Header": "my-value",
        },
        createdBy: "user-789",
    });

    console.log("Webhook created:", webhook.uuid);
    console.log("Secret (save this!):", webhook.secretPreview);

    // 2. Test the webhook
    const testResult = await WebhookManagementService.testWebhook(webhook.uuid);
    console.log("Test result:", testResult);

    // 3. Create an order (triggers webhook)
    const order = await OrderCommandService.createOrder({
        tenantUuid: "tenant-123",
        storeUuid: "store-456",
        userUuid: "customer-001",
        items: [
            {
                productUuid: "product-001",
                quantity: 2,
                price: 500,
            },
        ],
        orderType: "DINE_IN",
        tableNumber: "15",
    });

    console.log("Order created:", order.uuid);
    // Webhook "order.created" is automatically dispatched via EventBus

    // 4. View webhook deliveries
    const deliveries = await WebhookManagementService.getDeliveries({
        webhookUuid: webhook.uuid,
        page: 1,
        limit: 10,
    });

    console.log("Recent deliveries:", deliveries.data);

    // 5. View statistics
    const stats = await WebhookManagementService.getStatistics(webhook.uuid, 7);
    console.log("Webhook stats (7 days):", stats);

    // 6. Rotate secret if compromised
    const updated = await WebhookManagementService.rotateSecret(webhook.uuid);
    console.log("New secret:", updated.secretPreview);
}

function receivingWebhookExample() {
    const express = require("express");
    const crypto = require("crypto");

    const app = express();

    app.post("/webhooks/orders", express.json(), (req, res) => {
        // 1. Get signature from header
        const signature = req.headers["x-webhook-signature"];
        const webhookId = req.headers["x-webhook-id"];

        // 2. Verify signature
        const secret = process.env.WEBHOOK_SECRET; // Get from webhook creation
        const computedSignature = crypto
            .createHmac("sha256", secret)
            .update(JSON.stringify(req.body))
            .digest("hex");

        if (signature !== computedSignature) {
            return res.status(401).json({ error: "Invalid signature" });
        }

        // 3. Process webhook
        const { eventType, eventUuid, data } = req.body;

        switch (eventType) {
            case "order.created":
                console.log("New order:", data.order);
                // Your business logic here
                break;

            case "order.paid":
                console.log("Order paid:", data.order);
                // Your business logic here
                break;

            case "order.completed":
                console.log("Order completed:", data.order);
                // Your business logic here
                break;

            case "order.cancelled":
                console.log("Order cancelled:", data.order);
                // Your business logic here
                break;
        }

        // 4. Return 200 to acknowledge receipt
        res.status(200).json({ received: true });
    });

    app.listen(3000, () => {
        console.log("Webhook receiver running on port 3000");
    });
}