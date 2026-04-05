import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { SessionService } from "../auth/session.service.ts";
import { DeviceTrustService } from "./DeviceTrust.service.ts";
import { FraudService } from "./Fraud.service.ts";

export class SessionRiskService {
    static async analyze(input: {
        userUuid: string;
        tenantUuid: string;
        storeUuid?: string;
        req: any;
    }) {
        // FIX #4: Use correct field name
        const deviceFingerprint =
            (input.req.headers["x-fingerprint"] as string) ||
            (input.req.headers["x-device-fingerprint"] as string);
    
        const ipAddress =
            (input.req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
            input.req.ip ||
            "unknown";
    
        const isTrusted = await DeviceTrustService.isTrustedDevice(
            input.userUuid,
            deviceFingerprint
        );
    
        // Check rapid session creation (last 10 minutes)
        const recentSessions = await prisma.session.count({
        where: {
            userUuid: input.userUuid,
            ...(input.storeUuid && { storeUuid: input.storeUuid }),
            status: "ACTIVE",
            createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
        },
        });
    
        const distinctDevices = await prisma.session.findMany({
            where: {
                userUuid: input.userUuid,
                createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
            distinct: ["deviceFingerprint"],
            select: { deviceFingerprint: true },
        });
    
        // Calculate risk
        let severity: "LOW" | "MEDIUM" | "HIGH" = "LOW";
        let reason = "";
    
        if (!isTrusted && recentSessions > 3) {
            severity = "MEDIUM";
            reason = "Rapid login from untrusted device";
        }
    
        if (!isTrusted && distinctDevices.length >= 4) {
            severity = "HIGH";
            reason = "Multiple untrusted devices in short time";
        }
    
        // Record fraud event if not LOW
        if (severity !== "LOW") {
            await prisma.fraudEvent.create({
                data: {
                    tenantUuid: input.tenantUuid,   
                    userUuid: input.userUuid,
                    storeUuid: input.storeUuid,
                    type: "SUSPICIOUS_DEVICE",      
                    category: "AUTHENTICATION",      
                    severity,
                    reason,
                    ipAddress,
                    deviceFingerprint,
                    status: "PENDING",
                },
            });
        
            MetricsService.increment("security.session_risk", 1, { severity });
        }
    
        // Take action on HIGH risk
        if (severity === "HIGH") {
            await prisma.adminAlert.create({
                data: {
                    tenantUuid: input.tenantUuid,   
                    storeUuid: input.storeUuid,
                    alertType: "FRAUD_DETECTED",    
                    category: "SECURITY",           
                    level: "CRITICAL",             
                    priority: "HIGH",              
                    source: "AUTOMATED_CHECK",    
                    title: "High-Risk Login Behavior",
                    message: `Multiple untrusted devices detected for user ${input.userUuid}`,
                    context: {
                        userUuid: input.userUuid,
                        ipAddress,
                        deviceFingerprint,
                        recentSessions,
                        distinctDevices: distinctDevices.length,
                    },
                },
            });
    
            // Revoke all sessions
            await SessionService.revokeAllForUser({
                userUuid: input.userUuid,
                storeUuid: input.storeUuid,
                revokedBy: "SYSTEM",
                reason: "High-risk login behavior — sessions revoked automatically",
            });

            await FraudService.evaluateAutoBan(input.userUuid);
        
            logWithContext("warn", "[SessionRisk] HIGH risk — sessions revoked", {
                userUuid: input.userUuid,
                reason,
            });
        }
    
        return { severity, reason, isTrusted, recentSessions, distinctDevices: distinctDevices.length };
    }
}