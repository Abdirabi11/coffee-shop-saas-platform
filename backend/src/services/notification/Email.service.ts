import nodemailer from "nodemailer";
import prisma from "../../config/prisma.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";

// Values in templates come from customers and staff (names, addresses, item
// options): escape them before they go into HTML
function escapeHtml(value: unknown): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Amounts are stored in cents
function money(cents: unknown, currency: unknown): string {
    const amount = Number(cents);
    return `${Number.isFinite(amount) ? (amount / 100).toFixed(2) : "0.00"} ${escapeHtml(currency || "USD")}`;
}

function renderReceipt(data: any): string {
    const currency = data.currency;
    const items: any[] = Array.isArray(data.items) ? data.items : [];
    const rows = items.map((item) => `
        <tr>
            <td>${escapeHtml(item.quantity)} × ${escapeHtml(item.name)}${item.options ? `<br><small>${escapeHtml(item.options)}</small>` : ""}</td>
            <td style="text-align:right">${money(item.subtotal, currency)}</td>
        </tr>`).join("");
    const line = (label: string, cents: unknown) => `<tr><td>${label}</td><td style="text-align:right">${money(cents, currency)}</td></tr>`;
    const orderDate = data.orderDate ? new Date(data.orderDate) : null;

    return `
        <h1>Receipt</h1>
        <p>${escapeHtml(data.storeName)}${data.storeAddress ? `<br>${escapeHtml(data.storeAddress)}` : ""}</p>
        <p>Hi ${escapeHtml(data.customerName || "there")}, thanks for your order.</p>
        <p>Order #${escapeHtml(data.orderNumber)}${orderDate && !Number.isNaN(orderDate.getTime()) ? ` · ${escapeHtml(orderDate.toUTCString())}` : ""}<br>
           Receipt ${escapeHtml(data.receiptNumber)}</p>
        <table style="width:100%;border-collapse:collapse">
            ${rows}
            ${line("Subtotal", data.subtotal)}
            ${Number(data.discount) ? line("Discount", -Number(data.discount)) : ""}
            ${line("Tax", data.tax)}
            <tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${money(data.total, currency)}</strong></td></tr>
            ${data.amountTendered != null ? line("Paid", data.amountTendered) : ""}
            ${data.changeGiven != null ? line("Change", data.changeGiven) : ""}
        </table>
        <p>Paid by ${escapeHtml(data.paymentMethod)}${data.transactionId ? ` · Ref ${escapeHtml(data.transactionId)}` : ""}</p>`;
}

function renderEmailTemplate(template: string, data: any): string {
    // Simple template renderer — replace with Handlebars/EJS later
    switch (template) {
        case "receipt":
            return renderReceipt(data);
        case "email-verification":
            return `<h1>Verify Your Email</h1><p>Click here to verify: <a href="${data.verificationLink}">${data.verificationLink}</a></p><p>Expires in ${data.expiresIn}.</p>`;
        case "otp-verification":
            return `<h1>Your Code: ${data.otp}</h1><p>Expires in ${data.expiresIn}.</p>`;
        case "password-reset":
            return `<h1>Reset Password</h1><p>Click here: <a href="${data.resetLink}">${data.resetLink}</a></p><p>Expires in ${data.expiresIn}.</p>`;
        case "password-changed":
            return `<h1>Password Changed</h1><p>Your password was changed at ${data.timestamp}.</p>`;
        default:
            return `<pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
    }
}
export class EmailService {
    private static transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    // Send email with template. Never throws: a failed send is logged (and
    // recorded in EmailLog) and returned as { success: false }, so it can't
    // abort the caller's work, e.g. roll back a staff invitation. Callers
    // that must know check `success`.
    static async send(input: {
        to: string;
        subject: string;
        template: string;
        data: any;
        from?: string;
        replyTo?: string;
        attachments?: any[];
    }) {
        const startTime = Date.now();

        try {
            // Render HTML template
            const html = renderEmailTemplate(input.template, input.data);

            // Generate text version (strip HTML tags)
            const text = html.replace(/<[^>]*>/g, "");

            // Send email
            const info = await this.transporter.sendMail({
                from: input.from || process.env.SMTP_FROM || "noreply@coffeeapp.com",
                to: input.to,
                replyTo: input.replyTo,
                subject: input.subject,
                html,
                text,
                attachments: input.attachments,
            });

            const duration = Date.now() - startTime;

            logWithContext("info", "[Email] Email sent successfully", {
                to: input.to,
                template: input.template,
                messageId: info.messageId,
                durationMs: duration,
            });
        
            MetricsService.increment("email.sent", 1, {
                template: input.template,
            });
        
            MetricsService.timing("email.send.duration", duration);
        
            // Log to database
            await prisma.emailLog.create({
                data: {
                    type: input.template,
                    to: input.to,
                    subject: input.subject,
                    status: "SENT",
                },
            });
        
            return {
                success: true,
                messageId: info.messageId,
            };
        
        } catch (error: any) {
            logWithContext("error", "[Email] Failed to send email", {
                to: input.to,
                template: input.template,
                error: error.message,
            });
        
            MetricsService.increment("email.failed", 1, {
                template: input.template,
            });
        
            // Log failure; the log write failing too mustn't throw either
            try {
                await prisma.emailLog.create({
                    data: {
                        type: input.template,
                        to: input.to,
                        subject: input.subject,
                        status: "FAILED",
                        error: error.message,
                    },
                });
            } catch (logError: any) {
                logWithContext("error", "[Email] Failed to record email failure", {
                    to: input.to,
                    error: logError.message,
                });
            }

            return {
                success: false,
                error: error.message as string,
            };
        }
    }

    //Send bulk emails
    static async sendBulk(emails: Array<{
        to: string;
        subject: string;
        template: string;
        data: any;
    }>) {
        const results = await Promise.allSettled(
            emails.map((email) => this.send(email))
        );
    
        const sent = results.filter((r) => r.status === "fulfilled" && r.value.success).length;
        const failed = results.length - sent;
    
        logWithContext("info", "[Email] Bulk email sent", {
            total: emails.length,
            sent,
            failed,
        });
    
        return { sent, failed };
    }
 
    //Verify email configuration
    static async verifyConnection() {
        try {
            await this.transporter.verify();
            return true;
        } catch (error: any) {
            
        logWithContext("error", "[Email] SMTP connection failed", {
            error: error.message,
        });

        return false;
        }
    }
}