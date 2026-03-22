import { z } from "zod";
 
// ── Cashier Payment ─────────────────────────────────────────────────────────
 
export const processPaymentSchema = z
    .object({
        orderUuid: z.string().uuid(),
        paymentMethod: z.enum(["CASH", "CARD_TERMINAL"]),
        amount: z.number().positive().optional(), // Optional — service validates against order total
        amountTendered: z.number().positive().optional(),
        changeGiven: z.number().min(0).optional(),
        terminalId: z.string().optional(),
        receiptNumber: z.string().optional(),
        notes: z.string().max(500).optional(),
    })
    .refine(
        (data) => {
            if (data.paymentMethod === "CASH") {
                return data.amountTendered !== undefined && data.changeGiven !== undefined;
            }
            return true;
        },
        { message: "amountTendered and changeGiven required for CASH payments" }
    );
 
export const voidPaymentSchema = z.object({
    voidReason: z.string().min(10, "Void reason must be at least 10 characters"),
    managerPin: z.string().optional(),
});
 
export const correctPaymentSchema = z.object({
    correctAmount: z.number().positive(),
    correctionReason: z.string().min(10, "Correction reason must be at least 10 characters"),
});
 
export const openDrawerSchema = z.object({
    terminalId: z.string().min(1),
    openingBalance: z.number().min(0),
    storeUuid: z.string().uuid().optional(), 
});
 
export const closeDrawerSchema = z.object({
    actualCash: z.number().min(0),
    actualCard: z.number().min(0),
    closingNotes: z.string().max(500).optional(),
});

export const startPaymentSchema = z.object({
    orderUuid: z.string().uuid(),
    provider: z.enum(["STRIPE", "WALLET", "EVC_PLUS"]),
});
 
export const refundRequestSchema = z.object({
    orderUuid: z.string().uuid(),
    amount: z.number().positive().optional(), // Optional — defaults to full refund
    reason: z.string().min(5, "Reason must be at least 5 characters"),
});
 
export const adminOverrideSchema = z.object({
    targetState: z.enum(["PAID", "FAILED", "CANCELLED", "REFUNDED"]),
    reason: z.string().min(10, "Admin override requires detailed reason"),
});