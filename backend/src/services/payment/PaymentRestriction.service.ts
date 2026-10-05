import type { PaymentMethod, RestrictionSeverity, RestrictionType } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

// PaymentRestriction.userUuid holds the tenant membership uuid
// (tenantUser.uuid), same convention as PaymentRisk.
export class PaymentRestrictionService {
    static async blockRetries(input: {
        tenantUserUuid: string;
        tenantUuid: string;
        reason?: string;
    }) {
        await this.upsertRestriction({
            tenantUserUuid: input.tenantUserUuid,
            tenantUuid: input.tenantUuid,
            type: "DISABLE_RETRY",
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
            type: "BLOCK_WALLET_PAYMENTS",
            severity: "HIGH",
            appliesToMethods: ["WALLET", "EVC_PLUS"],
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
            type: "REQUIRE_MANUAL_REVIEW",
            severity: "HIGH",
            reason:
                input.reason ||
                "Risk threshold exceeded - manual review required",
        });
    }
    
    static async hasRestriction(
        tenantUserUuid: string,
        type: RestrictionType
    ): Promise<boolean> {
        const restriction = await prisma.paymentRestriction.findFirst({
            where: {
                userUuid: tenantUserUuid,
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
                userUuid: tenantUserUuid,
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
        type: RestrictionType;
        removedBy: string;
        notes?: string;
    }) {
        const result = await prisma.paymentRestriction.updateMany({
            where: {
                userUuid: input.tenantUserUuid,
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
        type: RestrictionType;
        severity: RestrictionSeverity;
        reason: string;
        appliesToMethods?: PaymentMethod[];
        maxAmount?: number;
    }) {
        // Check if an active restriction of this type already exists
        const existing = await prisma.paymentRestriction.findFirst({
            where: {
                userUuid: input.tenantUserUuid,
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
                    userUuid: input.tenantUserUuid,
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
