import prisma from "../../config/prisma.ts"
import { eventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";

export class FraudService {
    static async recordOtpFraud(input: {
        userUuid: string;
        tenantUuid: string;
        ipAddress: string;
        reason: string;
    }) {
        try {
            const fraudEvent = await prisma.fraudEvent.create({
                data: {
                    tenantUuid: input.tenantUuid,
                    userUuid: input.userUuid,
                    type: "OTP_BRUTE_FORCE",
                    category: "AUTHENTICATION",
                    severity: "HIGH",
                    reason: input.reason,
                    ipAddress: input.ipAddress,
                    status: "PENDING",
                },
            });
        
            await this.createSecurityAlert({
                tenantUuid: input.tenantUuid,
                title: "OTP Brute Force Detected",
                message: `User ${input.userUuid} triggered OTP brute force protection`,
                level: "ERROR",
                context: {
                    userUuid: input.userUuid,
                    ipAddress: input.ipAddress,
                    fraudEventUuid: fraudEvent.uuid,
                },
            });
        
            await this.evaluateAutoBan(input.userUuid);
        
            MetricsService.increment("fraud.otp_brute_force", 1);
    
            eventBus.emit("FRAUD_DETECTED", {
                type: "OTP_BRUTE_FORCE",
                userUuid: input.userUuid,
                tenantUuid: input.tenantUuid,
                fraudEventUuid: fraudEvent.uuid,
            });
        } catch (error: any) {
            logWithContext("error", "[Fraud] Failed to record OTP fraud", {
                error: error.message,
            });
        }
    }
 
    static async recordLoginBruteForce(input: {
        userUuid: string;
        tenantUuid: string;
        ipAddress: string;
        attemptUuid?: string;
    }) {
        try {
            await prisma.fraudEvent.create({
                data: {
                    tenantUuid: input.tenantUuid,
                    userUuid: input.userUuid,
                    type: "MULTIPLE_FAILED_LOGINS",
                    category: "AUTHENTICATION",
                    severity: "HIGH",
                    reason: "Multiple failed login attempts",
                    ipAddress: input.ipAddress,
                    status: "CONFIRMED",
                    metadata: input.attemptUuid ? { attemptUuid: input.attemptUuid } : undefined,
                },
            });
        
            // Increment failed attempts and check lock threshold
            const user = await prisma.user.update({
                where: { uuid: input.userUuid },
                data: { failedLoginAttempts: { increment: 1 } },
                select: { failedLoginAttempts: true },
            });
    
            if (user.failedLoginAttempts >= 10) {
                await prisma.user.update({
                    where: { uuid: input.userUuid },
                    data: {
                        lockedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
                    },
                });
        
                await this.createSecurityAlert({
                    tenantUuid: input.tenantUuid,
                    title: "Account Locked — Too Many Failed Logins",
                    message: `User locked after ${user.failedLoginAttempts} failed attempts`,
                    level: "CRITICAL",
                    context: { userUuid: input.userUuid },
                });
            }
        
            MetricsService.increment("fraud.login_brute_force", 1);
        } catch (error: any) {
            logWithContext("error", "[Fraud] Failed to record login brute force", {
                error: error.message,
            });
        }
    }
    
    static async recordSuspiciousLogin(input: {
        userUuid: string;
        tenantUuid: string;
        riskLevel: string;
        reason: string;
        ipAddress: string;
        deviceFingerprint?: string;
    }) {
        try {
            await prisma.fraudEvent.create({
                data: {
                    tenantUuid: input.tenantUuid,
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
                await this.createSecurityAlert({
                    tenantUuid: input.tenantUuid,
                    title: "Suspicious Login Detected",
                    message: input.reason,
                    level: input.riskLevel === "CRITICAL" ? "CRITICAL" : "ERROR",
                    context: {
                        userUuid: input.userUuid,
                        ipAddress: input.ipAddress,
                        deviceFingerprint: input.deviceFingerprint,
                    },
                });
            }
        
            MetricsService.increment("fraud.suspicious_login", 1, {
                riskLevel: input.riskLevel,
            });
        } catch (error: any) {
            logWithContext("error", "[Fraud] Failed to record suspicious login", {
                error: error.message,
            });
        }
    }
 
    static async recordPaymentFraud(input: {
        tenantUuid: string;
        userUuid?: string;
        storeUuid?: string;
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
                    userUuid: input.userUuid ?? "UNKNOWN",
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
                await this.createSecurityAlert({
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
            }
    
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
 
    static async evaluateAutoBan(userUuid: string) {
        try {
            const recentEvents = await prisma.fraudEvent.findMany({
                where: {
                    userUuid,
                    createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
                },
                orderBy: { createdAt: "desc" },
                take: 20,
                select: { severity: true },
            });
        
            // Score-based evaluation (from fraud.engine.ts, improved)
            const score = recentEvents.reduce((acc, e) => {
                switch (e.severity) {
                    case "LOW": return acc + 1;
                    case "MEDIUM": return acc + 3;
                    case "HIGH": return acc + 6;
                    case "CRITICAL": return acc + 10;
                    default: return acc;
                }
            }, 0);
    
            if (score >= 20) {
                await prisma.user.update({
                    where: { uuid: userUuid },
                    data: {
                        isBanned: true,
                        bannedAt: new Date(),
                        banReason: `Auto-banned: fraud score ${score} (${recentEvents.length} events in 7 days)`,
                    },
                });
        
                // Get tenant for alert
                const tenantUser = await prisma.tenantUser.findFirst({
                    where: { userUuid, isActive: true },
                    select: { tenantUuid: true },
                });
        
                if (tenantUser) {
                    await this.createSecurityAlert({
                        tenantUuid: tenantUser.tenantUuid,
                        title: "User Auto-Banned",
                        message: `User ${userUuid} auto-banned (score: ${score})`,
                        level: "CRITICAL",
                        context: { userUuid, score, eventCount: recentEvents.length },
                    });
                }
        
                logWithContext("warn", "[Fraud] User auto-banned", {
                    userUuid,
                    score,
                    eventCount: recentEvents.length,
                });
        
                MetricsService.increment("fraud.auto_ban", 1);
        
                return { banned: true, score };
            }
        
            return { banned: false, score };
        } catch (error: any) {
            logWithContext("error", "[Fraud] Failed to evaluate auto-ban", {
                error: error.message,
            });
            return { banned: false, score: 0 };
        }
    }
 
    static calculateRiskLevel(input: {
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
 
    private static async createSecurityAlert(input: {
        tenantUuid: string;
        storeUuid?: string;
        title: string;
        message: string;
        level: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
        context?: any;
    }) {
        await prisma.adminAlert.create({
            data: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                alertType: "FRAUD_DETECTED",   // FIX #3: valid AlertType
                category: "SECURITY",
                level: input.level,
                priority: input.level === "CRITICAL" ? "HIGH" : "MEDIUM",
                source: "AUTOMATED_CHECK",
                title: input.title,
                message: input.message,
                context: input.context,
            },
        });
    }
}