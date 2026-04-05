import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";


export class PaymentRiskScoreService{
    static async get(
        tenantUuid: string,
        tenantUserUuid: string
    ): Promise<number> {
        const record = await prisma.paymentRisk.findUnique({
            where: {
                tenantUuid_tenantUserUuid: {
                    tenantUuid,
                    tenantUserUuid,
                },
            },
        });
    
        return record?.score ?? 0;
    }

    static async increase(input: {
        tenantUserUuid: string; // FIX #3: Was `userUuid`, body referenced `tenantUserUuid`
        delta: number;
        reason: string;
        source?: string;
    }) {
        const tenantUuid = await this.getTenantUuid(input.tenantUserUuid);
 
        await prisma.$transaction(async (tx) => {
            const updated = await tx.paymentRisk.upsert({
                where: {
                    tenantUuid_tenantUserUuid: {
                        tenantUuid,
                        tenantUserUuid: input.tenantUserUuid,
                    },
                },
                update: {
                    score: { increment: input.delta },
                    lastIncidentAt: new Date(),
                    updatedAt: new Date(),
                },
                create: {
                    tenantUuid,
                    tenantUserUuid: input.tenantUserUuid,
                    score: input.delta,
                    level: this.calculateRiskLevel(input.delta),
                    lastIncidentAt: new Date(),
                },
            });
    
            const newLevel = this.calculateRiskLevel(updated.score);
            await tx.paymentRisk.update({
                where: {
                    tenantUuid_tenantUserUuid: {
                        tenantUuid,
                        tenantUserUuid: input.tenantUserUuid,
                    },
                },
                data: { level: newLevel },
            });
        
            await tx.fraudEvent.create({
                data: {
                    tenantUuid,
                    userUuid: input.tenantUserUuid,
                    storeUuid: "", // FIX: FraudEvent requires storeUuid — pass from caller or make nullable
                    type: "PAYMENT_VELOCITY_EXCEEDED", // FIX: Use valid FraudType enum value
                    category: "PAYMENT",
                    severity: this.calculateSeverity(input.delta),
                    reason: input.reason,
                    ipAddress: "SYSTEM", // FIX: FraudEvent requires ipAddress
                    metadata: {
                        delta: input.delta,
                        source: input.source || "PAYMENT_SYSTEM",
                    },
                },
            });
        });

        logWithContext("info", "[PaymentRiskScore] Score increased", {
            tenantUserUuid: input.tenantUserUuid,
            delta: input.delta,
            reason: input.reason,
        });
 
        // Emit event for high risk increases
        if (input.delta >= 30) {
            EventBus.emit("HIGH_RISK_INCREASE", {
                tenantUserUuid: input.tenantUserUuid,
                delta: input.delta,
                reason: input.reason,
            });
        }    
    }

    //Adjust risk score to specific value
    static async adjust(input: {
        tenantUserUuid: string;
        newScore: number;
        reason: string;
    }) {
        const tenantUuid = await this.getTenantUuid(input.tenantUserUuid);
 
        await prisma.$transaction(async (tx) => {
            await tx.paymentRisk.upsert({
                where: {
                    tenantUuid_tenantUserUuid: {
                        tenantUuid,
                        tenantUserUuid: input.tenantUserUuid,
                    },
                },
                update: {
                    score: input.newScore,
                    level: this.calculateRiskLevel(input.newScore),
                    updatedAt: new Date(),
                },
                create: {
                    tenantUuid,
                    tenantUserUuid: input.tenantUserUuid,
                    score: input.newScore,
                    level: this.calculateRiskLevel(input.newScore),
                },
            });
    
            await tx.fraudEvent.create({
                data: {
                    tenantUuid,
                    userUuid: input.tenantUserUuid,
                    storeUuid: "",
                    type: "PAYMENT_VELOCITY_EXCEEDED", // Use valid FraudType enum
                    category: "PAYMENT",
                    severity: "LOW",
                    reason: `Risk score adjusted: ${input.reason}`,
                    ipAddress: "SYSTEM",
                    metadata: {
                        reason: input.reason,
                        newScore: input.newScore,
                    },
                },
            });
        });
    
        logWithContext("info", "[PaymentRiskScore] Score adjusted", {
            tenantUserUuid: input.tenantUserUuid,
            newScore: input.newScore,
            reason: input.reason,
        });
    }
 

    //Decay risk score over time (call daily)
    static async decayScores() {
        const DECAY_AMOUNT = 5;
 
        // Batch: decrement all scores > 0, floor at 0
        const result = await prisma.$executeRaw`
            UPDATE "PaymentRisk"
            SET 
                score = GREATEST(0, score - ${DECAY_AMOUNT}),
                level = CASE
                WHEN GREATEST(0, score - ${DECAY_AMOUNT}) >= 80 THEN 'CRITICAL'
                WHEN GREATEST(0, score - ${DECAY_AMOUNT}) >= 60 THEN 'HIGH'
                WHEN GREATEST(0, score - ${DECAY_AMOUNT}) >= 40 THEN 'MEDIUM'
                WHEN GREATEST(0, score - ${DECAY_AMOUNT}) >= 20 THEN 'LOW'
                ELSE 'MINIMAL'
                END
            WHERE score > 0
        `;
    
        logWithContext("info", "[PaymentRiskScore] Scores decayed", {
            affectedRows: result,
            decayAmount: DECAY_AMOUNT,
        });
    }

    //Calculate risk level from score
    private static calculateRiskLevel(score: number): string {
        if (score >= 80) return "CRITICAL";
        if (score >= 60) return "HIGH";
        if (score >= 40) return "MEDIUM";
        if (score >= 20) return "LOW";
        return "MINIMAL";
    }
 
    // Calculate severity from delta
    private static calculateSeverity(
        delta: number
    ): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
        if (delta >= 50) return "CRITICAL";
        if (delta >= 25) return "HIGH";
        if (delta >= 10) return "MEDIUM";
        return "LOW";
    }

   //Get tenant UUID from tenant user
    private static async getTenantUuid(
        tenantUserUuid: string
    ): Promise<string> {
        const tenantUser = await prisma.tenantUser.findUnique({
            where: { uuid: tenantUserUuid },
            select: { tenantUuid: true },
        });
    
        if (!tenantUser) {
            throw new Error("TENANT_USER_NOT_FOUND");
        };
    
        return tenantUser.tenantUuid;
    }
};