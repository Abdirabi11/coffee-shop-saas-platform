import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { PaymentRiskScoreService } from "./paymentRiskScore.service.ts";

export class PaymentRestrictionService {
    static async blockRetries(input: {
        tenantUserUuid: string;
        tenantUuid: string;
        reason?: string;
    }) {
        await this.upsertRestriction({
            tenantUserUuid: input.tenantUserUuid,
            tenantUuid: input.tenantUuid,
            type: "BLOCK_RETRY",
            severity: "MEDIUM",
            reason: input.reason || "High risk score - retries blocked",
        });
    }
    
    static async disableWallet(input: {
        tenantUserUuid: string;
        tenantUuid: string;
        reason?: string;
    }) {
        await this.upsertRestriction({
            tenantUserUuid: input.tenantUserUuid,
            tenantUuid: input.tenantUuid,
            type: "DISABLE_WALLET",
            severity: "HIGH",
            appliesToMethods: ["WALLET", "EVC_PLUS", "ZAAD", "EDAHAB", "MPESA"],
            reason: input.reason || "Fraud risk - wallet payments disabled",
        });
    }
    
    static async requireManualReview(input: {
        tenantUserUuid: string;
        tenantUuid: string;
        reason?: string;
    }) {
        await this.upsertRestriction({
            tenantUserUuid: input.tenantUserUuid,
            tenantUuid: input.tenantUuid,
            type: "MANUAL_REVIEW",
            severity: "HIGH",
            reason:
                input.reason ||
                "Risk threshold exceeded - manual review required",
        });
    }
    
    static async hasRestriction(
        tenantUserUuid: string,
        type: string
    ): Promise<boolean> {
        const restriction = await prisma.paymentRestriction.findFirst({
            where: {
                tenantUserUuid,
                type,
                active: true,
                // Only count non-expired restrictions
                OR: [
                    { effectiveUntil: null },
                    { effectiveUntil: { gte: new Date() } },
                ],
            },
        });
    
        return !!restriction;
    }
    
    static async getActiveRestrictions(tenantUserUuid: string) {
        return prisma.paymentRestriction.findMany({
            where: {
                tenantUserUuid,
                active: true,
                OR: [
                { effectiveUntil: null },
                { effectiveUntil: { gte: new Date() } },
                ],
            },
            orderBy: { severity: "desc" },
        });
    }
    
    static async removeRestriction(input: {
        tenantUserUuid: string;
        type: string;
        removedBy: string;
        notes?: string;
    }) {
        const result = await prisma.paymentRestriction.updateMany({
            where: {
                tenantUserUuid: input.tenantUserUuid,
                type: input.type,
                active: true,
            },
            data: {
                active: false,
                reviewedBy: input.removedBy,
                reviewedAt: new Date(),
                reviewNotes: input.notes,
            },
        });
    
        logWithContext("info", "[PaymentRestriction] Removed", {
            tenantUserUuid: input.tenantUserUuid,
            type: input.type,
            removedBy: input.removedBy,
            count: result.count,
        });
    }
    
    private static async upsertRestriction(input: {
        tenantUserUuid: string;
        tenantUuid: string;
        type: string;
        severity: string;
        reason: string;
        appliesToMethods?: string[];
        maxAmount?: number;
    }) {
        // Check if an active restriction of this type already exists
        const existing = await prisma.paymentRestriction.findFirst({
            where: {
                tenantUserUuid: input.tenantUserUuid,
                tenantUuid: input.tenantUuid,
                type: input.type,
                active: true,
            },
            });
    
        if (existing) {
            // Update existing restriction (don't create duplicate)
            await prisma.paymentRestriction.update({
                where: { uuid: existing.uuid },
                data: {
                    severity: input.severity,
                    reason: input.reason,
                    ...(input.appliesToMethods && {
                        appliesToMethods: input.appliesToMethods,
                    }),
                    ...(input.maxAmount && { maxAmount: input.maxAmount }),
                    updatedAt: new Date(),
                },
            });
    
            logWithContext("info", "[PaymentRestriction] Updated existing", {
                restrictionUuid: existing.uuid,
                type: input.type,
                tenantUserUuid: input.tenantUserUuid,
            });
        } else {
            // Create new restriction
            await prisma.paymentRestriction.create({
                data: {
                    tenantUuid: input.tenantUuid,
                    tenantUserUuid: input.tenantUserUuid,
                    type: input.type,
                    severity: input.severity,
                    reason: input.reason,
                    active: true,
                    appliesToMethods: input.appliesToMethods || [],
                    maxAmount: input.maxAmount,
                    effectiveFrom: new Date(),
                },
            });
        
            logWithContext("info", "[PaymentRestriction] Created", {
                type: input.type,
                tenantUserUuid: input.tenantUserUuid,
                severity: input.severity,
            });
        }
    }
}
 
// ════════════════════════════════════════════════════════════════════════════
// RiskPolicyEnforcer
// Applies restrictions based on current risk score thresholds
// ════════════════════════════════════════════════════════════════════════════
 
export class RiskPolicyEnforcer {
    static async apply(tenantUserUuid: string) {
        const tenantUser = await prisma.tenantUser.findUnique({
            where: { uuid: tenantUserUuid },
            select: { tenantUuid: true },
        });
    
        if (!tenantUser) return;
    
        const score = await PaymentRiskScoreService.get(
            tenantUser.tenantUuid,
            tenantUserUuid
        );
    
        // Score >= 40: Block retries
        if (score >= 40) {
            await PaymentRestrictionService.blockRetries({
                tenantUserUuid,
                tenantUuid: tenantUser.tenantUuid,
                reason: `Risk score ${score} — retries blocked`,
            });
        }
    
        // Score >= 60: Disable wallet payments
        if (score >= 60) {
            await PaymentRestrictionService.disableWallet({
                tenantUserUuid,
                tenantUuid: tenantUser.tenantUuid,
                reason: `Risk score ${score} — wallet disabled`,
            });
        }
    
        // Score >= 80: Require manual review for everything
        if (score >= 80) {
            await PaymentRestrictionService.requireManualReview({
                tenantUserUuid,
                tenantUuid: tenantUser.tenantUuid,
                reason: `Risk score ${score} — manual review required`,
            });
        }
    }
}