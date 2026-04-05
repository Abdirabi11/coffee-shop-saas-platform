import nodemailer from "nodemailer";
import prisma from "../../config/prisma.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";

//sample
function renderEmailTemplate(template: string, data: any): string {
    // Simple template renderer — replace with Handlebars/EJS later
    switch (template) {
        case "email-verification":
            return `<h1>Verify Your Email</h1><p>Click here to verify: <a href="${data.verificationLink}">${data.verificationLink}</a></p><p>Expires in ${data.expiresIn}.</p>`;
        case "otp-verification":
            return `<h1>Your Code: ${data.otp}</h1><p>Expires in ${data.expiresIn}.</p>`;
        case "password-reset":
            return `<h1>Reset Password</h1><p>Click here: <a href="${data.resetLink}">${data.resetLink}</a></p><p>Expires in ${data.expiresIn}.</p>`;
        case "password-changed":
            return `<h1>Password Changed</h1><p>Your password was changed at ${data.timestamp}.</p>`;
        default:
            return `<pre>${JSON.stringify(data, null, 2)}</pre>`;
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

    //Send email with template
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
        
            // Log failure
            await prisma.emailLog.create({
                data: {
                    type: input.template,
                    to: input.to,
                    subject: input.subject,
                    status: "FAILED",
                    error: error.message,
                },
            });
            throw error;
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
    
        const sent = results.filter((r) => r.status === "fulfilled").length;
        const failed = results.filter((r) => r.status === "rejected").length;
    
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