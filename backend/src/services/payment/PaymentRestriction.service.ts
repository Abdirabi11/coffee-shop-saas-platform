import prisma from "../../config/prisma.ts"

export class PaymentRestrictionService{
    static async blockRetries(input: {
        tenantUserUuid: string;
        tenantUuid: string;
        reason?: string;
    }) {
        await this.upsert({
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
        await this.upsert({
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
        await this.upsert({
          tenantUserUuid: input.tenantUserUuid,
          tenantUuid: input.tenantUuid,
          type: "MANUAL_REVIEW",
          severity: "HIGH",
          reason: input.reason || "Risk threshold exceeded - manual review required",
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
          },
        });
    
        return !!restriction;
    }

    static async getActiveRestrictions(tenantUserUuid: string) {
        return prisma.paymentRestriction.findMany({
          where: {
            tenantUserUuid,
            active: true,
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
        await prisma.paymentRestriction.updateMany({
          where: {
            tenantUserUuid: input.tenantUserUuid,
            type: input.type,
          },
          data: {
            active: false,
            reviewedBy: input.removedBy,
            reviewedAt: new Date(),
            reviewNotes: input.notes,
          },
        });
    }

    private static async upsert(input: {
        tenantUserUuid: string;
        tenantUuid: string;
        type: string;
        severity: string;
        reason: string;
        appliesToMethods?: string[];
        maxAmount?: number;
    }) {
        await prisma.paymentRestriction.upsert({
            where: {
                    tenantUuid_tenantUserUuid_type_effectiveFrom: {
                    tenantUuid: input.tenantUuid,
                    tenantUserUuid: input.tenantUserUuid,
                    type: input.type,
                    effectiveFrom: new Date(),
                },
            },
            update: {
                active: true,
                severity: input.severity,
                reason: input.reason,
                ...(input.appliesToMethods && { appliesToMethods: input.appliesToMethods }),
                ...(input.maxAmount && { maxAmount: input.maxAmount }),
            },
            create: {
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
    
        console.log(`[PaymentRestriction] Applied ${input.type} for user ${input.tenantUserUuid}`);
    }
}