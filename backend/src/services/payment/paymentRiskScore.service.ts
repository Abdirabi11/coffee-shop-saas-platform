import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";


export class PaymentRiskScoreService{
    static async get(userUuid: string): Promise<number>{
        const record = await prisma.paymentRisk.findUnique({
            where: {
                tenantUuid_tenantUserUuid: {
                    tenantUuid: await this.getTenantUuid(tenantUserUuid),
                    tenantUserUuid,
                },
            },
        });
      
        return record?.score ?? 0;
    }

    static async increase(input: {
        userUuid: string,
        delta: number,
        reason: string,
        source?: string,
    }){
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
    
            // Update risk level based on new score
            const newLevel = this.calculateRiskLevel(updated.score + input.delta);
            await tx.paymentRisk.update({
                where: {
                    tenantUuid_tenantUserUuid: {
                        tenantUuid,
                        tenantUserUuid: input.tenantUserUuid,
                    },
                },
                data: { level: newLevel },
            });
    
            // Create fraud event
            await tx.fraudEvent.create({
                data: {
                tenantUuid,
                tenantUserUuid: input.tenantUserUuid,
                type: input.reason,
                severity: this.calculateSeverity(input.delta),
                source: input.source || "PAYMENT_SYSTEM",
                metadata: {
                    delta: input.delta,
                    reason: input.reason,
                },
                },
            });
        });

        console.log(`[PaymentRiskScore] Increased by ${input.delta} for ${input.tenantUserUuid}: ${input.reason}`);

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
                    tenantUserUuid: input.tenantUserUuid,
                    type: "RISK_SCORE_ADJUSTED",
                    severity: "LOW",
                    metadata: {
                        reason: input.reason,
                        newScore: input.newScore,
                    },
                },
            });
        });

        console.log(`[PaymentRiskScore] Adjusted to ${input.newScore} for ${input.tenantUserUuid}: ${input.reason}`);
    }

    //Decay risk score over time (call daily)
    static async decayScores() {
        const DECAY_AMOUNT = 5; // Reduce by 5 points per day

        const risks = await prisma.paymentRisk.findMany({
        where: {
            score: { gt: 0 },
        },
        });

        for (const risk of risks) {
        const newScore = Math.max(0, risk.score - DECAY_AMOUNT);
        const newLevel = this.calculateRiskLevel(newScore);

        await prisma.paymentRisk.update({
            where: { uuid: risk.uuid },
            data: {
            score: newScore,
            level: newLevel,
            },
        });
        }

        console.log(`[PaymentRiskScore] Decayed ${risks.length} risk scores`);
    }

    //Calculate risk level from score
    private static calculateRiskLevel(score: number): string {
        if (score >= 80) return "CRITICAL";
        if (score >= 60) return "HIGH";
        if (score >= 40) return "MEDIUM";
        if (score >= 20) return "LOW";
        return "MINIMAL";
    }

   //Calculate severity from delta
    private static calculateSeverity(delta: number): string {
        if (delta >= 50) return "CRITICAL";
        if (delta >= 25) return "HIGH";
        if (delta >= 10) return "MEDIUM";
        return "LOW";
    }

   //Get tenant UUID from tenant user
    private static async getTenantUuid(tenantUserUuid: string): Promise<string> {
        const tenantUser = await prisma.tenantUser.findUnique({
            where: { uuid: tenantUserUuid },
            select: { tenantUuid: true },
        });

        if (!tenantUser) {
            throw new Error("TenantUser not found");
        }

        return tenantUser.tenantUuid;
    }
};