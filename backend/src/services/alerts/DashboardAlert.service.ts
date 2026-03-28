import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { EmailService } from "../notification/Email.service.ts";


export class DashboardAlertService {
  
    static async createAlert(input: {
        tenantUuid?: string;
        type: string;
        level: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
        priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
        title: string;
        message: string;
        metadata?: any;
    }) {
        const alert = await prisma.adminAlert.create({
            data: {
                tenantUuid: input.tenantUuid || "SYSTEM",
                type: input.type,
                level: input.level,
                priority: input.priority,
                title: input.title,
                message: input.message,
                metadata: input.metadata,
                status: "PENDING",
            },
        });

        // Emit event for real-time notification
        EventBus.emit("ADMIN_ALERT_CREATED", { alert });

        // Send email for critical/urgent alerts
        if (input.level === "CRITICAL" || input.priority === "URGENT") {
            await this.notifyAdmins(alert);
        }

        return alert;
    }

    static async monitorQuotas() {
        const quotas = await prisma.usageQuota.findMany({
            include: {
                tenant: true,
            },
        });

        for (const quota of quotas) {
            const usagePercent = (quota.used / quota.limit) * 100;

            // Alert at 80%, 90%, 100%
            if (usagePercent >= 80 && usagePercent < 90) {
                await this.createAlert({
                    tenantUuid: quota.tenantUuid,
                    type: "QUOTA_WARNING",
                    level: "WARNING",
                    priority: "MEDIUM",
                    title: `Quota Warning: ${quota.quotaName}`,
                    message: `${quota.quotaName} is at ${Math.round(usagePercent)}% capacity`,
                    metadata: { quotaUuid: quota.uuid, usagePercent },
                });
            } else if (usagePercent >= 90 && usagePercent < 100) {
                await this.createAlert({
                    tenantUuid: quota.tenantUuid,
                    type: "QUOTA_WARNING",
                    level: "ERROR",
                    priority: "HIGH",
                    title: `Quota Alert: ${quota.quotaName}`,
                    message: `${quota.quotaName} is at ${Math.round(usagePercent)}% capacity`,
                    metadata: { quotaUuid: quota.uuid, usagePercent },
                });
            } else if (usagePercent >= 100) {
                await this.createAlert({
                    tenantUuid: quota.tenantUuid,
                    type: "QUOTA_EXCEEDED",
                    level: "CRITICAL",
                    priority: "URGENT",
                    title: `Quota Exceeded: ${quota.quotaName}`,
                    message: `${quota.quotaName} has exceeded its limit`,
                    metadata: { quotaUuid: quota.uuid, usagePercent },
                });
            }
        }
    }

    static async monitorPaymentFailures() {
        const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const failedPayments = await prisma.payment.groupBy({
            by: ["tenantUuid"],
            where: {
                status: "FAILED",
                createdAt: { gte: last24h },
            },
            _count: { uuid: true },
            having: {
                uuid: { _count: { gte: 5 } },
            },
        });

        for (const failure of failedPayments) {
            await this.createAlert({
                tenantUuid: failure.tenantUuid,
                type: "PAYMENT_FAILURES",
                level: "ERROR",
                priority: "HIGH",
                title: "Multiple Payment Failures",
                message: `${failure._count.uuid} payment failures in the last 24 hours`,
                metadata: { failureCount: failure._count.uuid },
            });
        }
    }

    private static async notifyAdmins(alert: any) {
        const admins = await prisma.user.findMany({
            where: { globalRole: "SUPER_ADMIN" },
            select: { email: true },
        });

        for (const admin of admins) {
            if (admin.email) {
                await EmailService.send({
                to: admin.email,
                subject: `[${alert.level}] ${alert.title}`,
                template: "admin-alert",
                data: {
                    level: alert.level,
                    title: alert.title,
                    message: alert.message,
                    timestamp: alert.createdAt,
                },
                });
            }
        }
    }
}
