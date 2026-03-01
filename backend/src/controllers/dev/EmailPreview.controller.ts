import { Request, Response } from "express";
import { renderEmailTemplate } from "../../utils/emailTemplates.ts";

export class EmailPreviewController {
  
    //GET /dev/email-preview/:template
    //Preview email templates in browser
    static async preview(req: Request, res: Response) {
        try {
            const { template } = req.params;

            // Sample data for each template
            const sampleData: Record<string, any> = {
                "email-verification": {
                    verificationLink: "https://app.example.com/verify-email?token=abc123",
                    expiresIn: "24 hours",
                    email: "user@example.com",
                },
                "otp-verification": {
                    name: "John Doe",
                    otp: "123456",
                    expiresIn: "5 minutes",
                    email: "user@example.com",
                },
                "password-reset": {
                    name: "John Doe",
                    resetLink: "https://app.example.com/reset-password?token=abc123",
                    expiresIn: "1 hour",
                    email: "user@example.com",
                },
                "tenant-invitation": {
                    inviterName: "Jane Smith",
                    tenantName: "Acme Coffee Co.",
                    role: "Manager",
                    storeNames: "Downtown Store, Airport Store",
                    inviteLink: "https://app.example.com/accept-invite?token=abc123",
                    expiresIn: "7 days",
                    email: "user@example.com",
                },
                "order-confirmation": {
                    customerName: "John Doe",
                    orderNumber: "ORD-12345",
                    estimatedReadyTime: "15-20 minutes",
                    items: [
                        {
                            name: "Caramel Latte",
                            options: "Large, Extra shot, Oat milk",
                            quantity: 2,
                            price: 1200,
                        },
                        {
                            name: "Blueberry Muffin",
                            quantity: 1,
                            price: 450,
                        },
                    ],
                    subtotal: 2850,
                    tax: 228,
                    discount: 285,
                    total: 2793,
                    storeName: "Coffee App Downtown",
                    storeAddress: "123 Main St, New York, NY 10001",
                    trackOrderUrl: "https://app.example.com/orders/track/ORD-12345",
                    email: "user@example.com",
                },
                "order-ready": {
                    customerName: "John Doe",
                    orderNumber: "ORD-12345",
                    storeName: "Coffee App Downtown",
                    storeAddress: "123 Main St, New York, NY 10001",
                    tableNumber: "15",
                    qrCode: "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=ORD-12345",
                    email: "user@example.com",
                },
                "welcome": {
                    name: "John Doe",
                    promoCode: "WELCOME20",
                    promoDiscount: "20%",
                    appUrl: "https://app.example.com",
                    email: "user@example.com",
                },
                "receipt": {
                    customerName: "John Doe",
                    orderNumber: "ORD-12345",
                    orderDate: new Date(),
                    storeName: "Coffee App Downtown",
                    paymentMethod: "Credit Card (****1234)",
                    transactionId: "txn_abc123xyz",
                    items: [
                        {
                            name: "Caramel Latte",
                            options: "Large, Extra shot, Oat milk",
                            quantity: 2,
                            price: 1200,
                        },
                        {
                            name: "Blueberry Muffin",
                            quantity: 1,
                            price: 450,
                        },
                    ],
                    subtotal: 2850,
                    tax: 228,
                    taxRate: 8,
                    tip: 500,
                    discount: 285,
                    total: 3293,
                    loyaltyPoints: 33,
                    totalPoints: 150,
                    supportPhone: "+1 (555) 123-4567",
                    email: "user@example.com",
                },
            };

            const data = sampleData[template] || { email: "user@example.com" };

            // Add common data
            data.appUrl = process.env.APP_URL || "https://app.example.com";
            data.year = new Date().getFullYear();

            const html = renderEmailTemplate(template, data);

            res.setHeader("Content-Type", "text/html");
            res.send(html);
        } catch (error: any) {
            res.status(500).send(`
                <h1>Error</h1>
                <p>${error.message}</p>
                <pre>${error.stack}</pre>
            `);
        }
    }

    //GET /dev/email-preview
    //List all available templates
    static async list(req: Request, res: Response) {
        const templates = [
            "email-verification",
            "otp-verification",
            "password-reset",
            "password-changed",
            "tenant-invitation",
            "order-confirmation",
            "order-ready",
            "security-alert",
            "welcome",
            "receipt",
        ];

        const html = `
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Email Template Preview</title>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            max-width: 800px;
                            margin: 50px auto;
                            padding: 20px;
                        }
                        h1 { color: #333; }
                        ul { list-style: none; padding: 0; }
                        li {
                            margin: 10px 0;
                            padding: 15px;
                            background: #f8f9fa;
                            border-radius: 6px;
                        }
                        a {
                            color: #667eea;
                            text-decoration: none;
                            font-weight: 600;
                        }
                        a:hover { text-decoration: underline; }
                    </style>
                </head>
                <body>
                    <h1>📧 Email Template Preview</h1>
                    <p>Click on a template to preview it:</p>
                    <ul>
                        ${templates.map((t) => `
                            <li>
                                <a href="/dev/email-preview/${t}" target="_blank">
                                    ${t}
                                </a>
                            </li>
                        `).join("")}
                    </ul>
                </body>
            </html>
        `;

        res.send(html);
    }
}


// usage example(
//     // Send email verification
// await EmailService.send({
//     to: "user@example.com",
//     subject: "Verify Your Email Address",
//     template: "email-verification",
//     data: {
//       verificationLink: "https://app.example.com/verify?token=abc123",
//       expiresIn: "24 hours",
//     },
//   });
  
//   // Send order confirmation
//   await EmailService.send({
//     to: "customer@example.com",
//     subject: "Order Confirmed - ORD-12345",
//     template: "order-confirmation",
//     data: {
//       customerName: "John Doe",
//       orderNumber: "ORD-12345",
//       items: [...],
//       total: 2500,
//       // ... other order data
//     },
//   });
  
//   // Send bulk emails
//   await EmailService.sendBulk([
//     {
//       to: "user1@example.com",
//       subject: "Welcome!",
//       template: "welcome",
//       data: { name: "User 1" },
//     },
//     {
//       to: "user2@example.com",
//       subject: "Welcome!",
//       template: "welcome",
//       data: { name: "User 2" },
//     },
//   ]);
// )