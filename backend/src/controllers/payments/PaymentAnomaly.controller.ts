import { Request, Response } from "express";
import prisma from "../../config/prisma.ts"
import { z } from "zod";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
 
 
const reviewAnomalySchema = z.object({
    status: z.enum(["INVESTIGATING", "RESOLVED", "DISMISSED", "CONFIRMED"]),
    reviewNotes: z.string().min(5).optional(),
    resolution: z.string().optional(),
});
 
export class PaymentAnomalyController {
    // GET /api/v1/payments/anomalies
    static async list(req: Request, res: Response) {
        try {
            const staff = (req as any).user;
            if (!staff) {
                return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
            }
        
            if (!["MANAGER", "ADMIN"].includes(staff.role)) {
                return res.status(403).json({ success: false, error: "MANAGER_REQUIRED" });
            }
        
            const { storeUuid, status, severity, limit } = req.query;
        
            const anomalies = await prisma.paymentAnomaly.findMany({
                where: {
                    // Tenant isolation
                    tenantUuid: staff.tenantUuid,
                    ...(storeUuid && { storeUuid: storeUuid as string }),
                    ...(status && { status: status as any }),
                    ...(severity && { severity: severity as any }),
                },
                include: {
                    payment: {
                        select: {
                            uuid: true,
                            amount: true,
                            paymentMethod: true,
                            processedBy: true,
                            processedAt: true,
                            order: {
                                select: { orderNumber: true, totalAmount: true },
                            },
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
                take: parseInt(limit as string) || 50,
            });
        
            return res.status(200).json({
                success: true,
                data: anomalies,
                count: anomalies.length,
            });
        } catch (error: any) {
            logWithContext("error", "[AnomalyController] list failed", {
                error: error.message,
            });
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
    
    // POST /api/v1/payments/anomalies/:anomalyUuid/review
    static async review(req: Request, res: Response) {
        try {
            const staff = (req as any).user;
            if (!staff) {
                return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
            }
        
            if (!["MANAGER", "ADMIN"].includes(staff.role)) {
                return res.status(403).json({ success: false, error: "MANAGER_REQUIRED" });
            };
        
            const { anomalyUuid } = req.params;
        
            const parsed = reviewAnomalySchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({
                    success: false,
                    error: "VALIDATION_ERROR",
                    details: parsed.error.format(),
                });
            };
    
            const anomaly = await prisma.paymentAnomaly.update({
                where: { uuid: anomalyUuid },
                data: {
                    status: parsed.data.status,
                    reviewedBy: staff.uuid,
                    reviewedAt: new Date(),
                    reviewNotes: parsed.data.reviewNotes,
                    resolution: parsed.data.resolution,
                },
            });
    
            // If resolved/dismissed, unflag the payment
            if (parsed.data.status === "RESOLVED" || parsed.data.status === "DISMISSED") {
                await prisma.payment.update({
                    where: { uuid: anomaly.paymentUuid },
                    data: {
                        flaggedForReview: false,
                        reviewedBy: staff.uuid,
                        reviewedAt: new Date(),
                        reviewNotes: parsed.data.reviewNotes,
                        reviewOutcome:
                        parsed.data.status === "RESOLVED" ? "APPROVED" : "DISPUTED",
                    },
                });
            }
        
            return res.status(200).json({ success: true, data: anomaly });
        } catch (error: any) {
            logWithContext("error", "[AnomalyController] review failed", {
                error: error.message,
            });
            return res.status(500).json({ success: false, error: "REVIEW_FAILED" });
        }
    }
    
    // GET /api/v1/payments/flagged
    static async listFlaggedPayments(req: Request, res: Response) {
        try {
            const staff = (req as any).user;
            if (!staff) {
                return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
            }
        
            if (!["MANAGER", "ADMIN"].includes(staff.role)) {
                return res.status(403).json({ success: false, error: "MANAGER_REQUIRED" });
            }
        
            const flagged = await prisma.payment.findMany({
                where: {
                    tenantUuid: staff.tenantUuid,
                    flaggedForReview: true,
                    reviewedAt: null, // Not yet reviewed
                },
                select: {
                    uuid: true,
                    orderUuid: true,
                    amount: true,
                    paymentMethod: true,
                    paymentFlow: true,
                    flagReason: true,
                    flaggedAt: true,
                    processedBy: true,
                    processedAt: true,
                    order: {
                        select: { orderNumber: true },
                    },
                },
                orderBy: { flaggedAt: "desc" },
                take: 50,
            });
        
            return res.status(200).json({
                success: true,
                data: flagged,
                count: flagged.length,
            });
        } catch (error: any) {
            logWithContext("error", "[AnomalyController] listFlagged failed", {
                error: error.message,
            });
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
}