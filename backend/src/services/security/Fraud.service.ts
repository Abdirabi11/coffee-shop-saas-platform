import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";

export class FraudService {
  
    //Record OTP fraud
    static async recordOtpFraud(input: {
        userUuid: string;
        ipAddress: string;
        reason: string;
    }) {
        try {
            const user = await prisma.user.findUnique({
                where: { uuid: input.userUuid },
                include: {
                    tenantUsers: {
                        where: { isActive: true },
                        take: 1,
                    },
                },
            });
  
            if (!user) return;
    
            const tenantUuid = user.tenantUsers[0]?.tenantUuid || "SYSTEM";
    
            const fraudEvent = await prisma.fraudEvent.create({
                data: {
                    tenantUuid,
                    userUuid: input.userUuid,
                    type: "OTP_BRUTE_FORCE",
                    category: "AUTHENTICATION",
                    severity: "HIGH",
                    reason: input.reason,
                    ipAddress: input.ipAddress,
                    status: "PENDING",
                },
            });
    
            // Create admin alert
            await prisma.adminAlert.create({
                data: {
                    tenantUuid,
                    alertType: "FRAUD",
                    category: "SECURITY",
                    level: "ERROR",
                    priority: "HIGH",
                    title: "OTP Brute Force Detected",
                    message: `User ${input.userUuid} triggered OTP brute force protection`,
                    context: {
                        userUuid: input.userUuid,
                        ipAddress: input.ipAddress,
                        fraudEventUuid: fraudEvent.uuid,
                    },
                },
            });
    
            // Evaluate auto-ban
            await this.evaluateAutoBan(input.userUuid);
    
            logWithContext("warn", "[Fraud] OTP fraud recorded", {
            userUuid: input.userUuid,
            fraudEventUuid: fraudEvent.uuid,
            });
    
            MetricsService.increment("fraud.otp_brute_force", 1);
    
            EventBus.emit("FRAUD_DETECTED", {
            type: "OTP_BRUTE_FORCE",
            userUuid: input.userUuid,
            fraudEventUuid: fraudEvent.uuid,
            });
  
        } catch (error: any) {
            logWithContext("error", "[Fraud] Failed to record OTP fraud", {
                error: error.message,
            });
        }
    }

    //Record login brute force
    static async recordLoginBruteForce(input: {
        userUuid: string;
        ipAddress: string;
        attemptUuid: string;
    }) {
        try {
            const user = await prisma.user.findUnique({
                where: { uuid: input.userUuid },
                include: {
                    tenantUsers: { where: { isActive: true }, take: 1 },
                },
            });
        
            if (!user) return;
        
            const tenantUuid = user.tenantUsers[0]?.tenantUuid || "SYSTEM";
        
            await prisma.fraudEvent.create({
                data: {
                    tenantUuid,
                    userUuid: input.userUuid,
                    type: "MULTIPLE_FAILED_LOGINS",
                    category: "AUTHENTICATION",
                    severity: "HIGH",
                    reason: "Multiple failed login attempts",
                    ipAddress: input.ipAddress,
                    status: "CONFIRMED",
                    metadata: {
                        attemptUuid: input.attemptUuid,
                    },
                },
            });
    
            // Increment failed login attempts
            await prisma.user.update({
                where: { uuid: input.userUuid },
                data: {
                    failedLoginAttempts: { increment: 1 },
                },
            });
        
            // Lock account if too many failures
            const updated = await prisma.user.findUnique({
                where: { uuid: input.userUuid },
                select: { failedLoginAttempts: true },
            });
    
            if (updated && updated.failedLoginAttempts >= 10) {
                await prisma.user.update({
                    where: { uuid: input.userUuid },
                    data: {
                        lockedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // Lock for 24 hours
                    },
                });
        
                await this.createAlert({
                    tenantUuid,
                    title: "Account Locked",
                    message: `User ${input.userUuid} locked due to too many failed login attempts`,
                    level: "CRITICAL",
                });
            };
    
            logWithContext("warn", "[Fraud] Login brute force recorded", {
                userUuid: input.userUuid,
            });
        
            MetricsService.increment("fraud.login_brute_force", 1);
    
        } catch (error: any) {
            logWithContext("error", "[Fraud] Failed to record login brute force", {
                error: error.message,
            });
        }
    }
 
    //Record suspicious login
    static async recordSuspiciousLogin(input: {
        userUuid: string;
        riskLevel: string;
        reason: string;
        ipAddress: string;
        deviceFingerprint?: string;
    }) {
        try {
            const user = await prisma.user.findUnique({
                where: { uuid: input.userUuid },
                include: {
                    tenantUsers: { where: { isActive: true }, take: 1 },
                },
            });
        
            if (!user) return;
        
            const tenantUuid = user.tenantUsers[0]?.tenantUuid || "SYSTEM";
    
            await prisma.fraudEvent.create({
                data: {
                    tenantUuid,
                    userUuid: input.userUuid,
                    type: "SUSPICIOUS_DEVICE",
                    category: "AUTHENTICATION",
                    severity: input.riskLevel === "CRITICAL" ? "CRITICAL" : "HIGH",
                    reason: input.reason,
                    ipAddress: input.ipAddress,
                    deviceFingerprint: input.deviceFingerprint,
                    status: "PENDING",
                },
            });
    
            if (input.riskLevel === "CRITICAL" || input.riskLevel === "HIGH") {
                await this.createAlert({
                    tenantUuid,
                    title: "Suspicious Login Detected",
                    message: input.reason,
                    level: input.riskLevel === "CRITICAL" ? "CRITICAL" : "ERROR",
                    context: {
                        userUuid: input.userUuid,
                        ipAddress: input.ipAddress,
                        deviceFingerprint: input.deviceFingerprint,
                    },
                });
            };
        
            logWithContext("warn", "[Fraud] Suspicious login recorded", {
                userUuid: input.userUuid,
                riskLevel: input.riskLevel,
            });
    
            MetricsService.increment("fraud.suspicious_login", 1, {
                riskLevel: input.riskLevel,
            });
        
        } catch (error: any) {
            logWithContext("error", "[Fraud] Failed to record suspicious login", {
                error: error.message,
            });
        }
    }
 
    //Record payment fraud
    static async recordPaymentFraud(input: {
        tenantUuid: string;
        userUuid?: string;
        storeUuid: string;
        orderUuid?: string;
        paymentUuid?: string;
        type: string;
        reason: string;
        severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
        ipAddress?: string;
        metadata?: any;
    }) {
        try {
            await prisma.fraudEvent.create({
                data: {
                    tenantUuid: input.tenantUuid,
                    userUuid: input.userUuid,
                    storeUuid: input.storeUuid,
                    orderUuid: input.orderUuid,
                    paymentUuid: input.paymentUuid,
                    type: input.type as any,
                    category: "PAYMENT",
                    severity: input.severity,
                    reason: input.reason,
                    ipAddress: input.ipAddress,
                    metadata: input.metadata,
                    status: "PENDING",
                },
            });
        
            if (input.severity === "HIGH" || input.severity === "CRITICAL") {
                await this.createAlert({
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    title: "Payment Fraud Detected",
                    message: input.reason,
                    level: input.severity === "CRITICAL" ? "CRITICAL" : "ERROR",
                    context: {
                        orderUuid: input.orderUuid,
                        paymentUuid: input.paymentUuid,
                    },
                });
            };
        
            logWithContext("warn", "[Fraud] Payment fraud recorded", {
                type: input.type,
                severity: input.severity,
            });
    
            MetricsService.increment("fraud.payment", 1, {
                type: input.type,
                severity: input.severity,
            });
    
        } catch (error: any) {
            logWithContext("error", "[Fraud] Failed to record payment fraud", {
                error: error.message,
            });
        }
    }
 
    //Evaluate auto-ban
    static async evaluateAutoBan(userUuid: string) {
        try {
            // Count fraud events in last 7 days
            const recentFraudEvents = await prisma.fraudEvent.count({
                where: {
                    userUuid,
                    severity: { in: ["HIGH", "CRITICAL"] },
                    createdAt: {
                        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                    },
                },
            });
        
            // Auto-ban if 3+ high/critical fraud events
            if (recentFraudEvents >= 3) {
                await prisma.user.update({
                    where: { uuid: userUuid },
                    data: {
                        isBanned: true,
                        bannedAt: new Date(),
                        banReason: `Auto-banned: ${recentFraudEvents} fraud events in 7 days`,
                    },
                });
        
                const user = await prisma.user.findUnique({
                    where: { uuid: userUuid },
                    include: {
                        tenantUsers: { where: { isActive: true }, take: 1 },
                    },
                });
        
                if (user) {
                    const tenantUuid = user.tenantUsers[0]?.tenantUuid || "SYSTEM";
            
                    await this.createAlert({
                        tenantUuid,
                        title: "User Auto-Banned",
                        message: `User ${userUuid} was automatically banned due to ${recentFraudEvents} fraud events`,
                        level: "CRITICAL",
                        priority: "URGENT",
                    });
                }
        
                logWithContext("warn", "[Fraud] User auto-banned", {
                    userUuid,
                    fraudEventCount: recentFraudEvents,
                });
        
                MetricsService.increment("fraud.auto_ban", 1);
            };
    
        } catch (error: any) {
            logWithContext("error", "[Fraud] Failed to evaluate auto-ban", {
                error: error.message,
            });
        }
    }
    
    //Calculate fraud score
    static calculateFraudScore(input: {
        rapidSessions: boolean;
        newFingerprint: boolean;
        geoChanged: boolean;
        velocityExceeded?: boolean;
        multiplePaymentFailures?: boolean;
    }): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
        let score = 0;
    
        if (input.rapidSessions) score += 40;
        if (input.newFingerprint) score += 30;
        if (input.geoChanged) score += 30;
        if (input.velocityExceeded) score += 50;
        if (input.multiplePaymentFailures) score += 60;
    
        if (score >= 100) return "CRITICAL";
        if (score >= 70) return "HIGH";
        if (score >= 40) return "MEDIUM";
        return "LOW";
    }
 
    //Create admin alert
    private static async createAlert(input: {
        tenantUuid: string;
        storeUuid?: string;
        title: string;
        message: string;
        level: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
        priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
        context?: any;
    }) {
        await prisma.adminAlert.create({
            data: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                alertType: "FRAUD",
                category: "SECURITY",
                level: input.level,
                priority: input.priority || "HIGH",
                title: input.title,
                message: input.message,
                context: input.context,
            },
        });
    }
}