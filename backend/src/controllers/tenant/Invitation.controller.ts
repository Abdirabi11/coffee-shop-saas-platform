import type { Request, Response } from "express";
import { z } from "zod";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { planLimitErrorResponse } from "../../services/billing/PlanLimit.service.ts";
import { TenantInvitationService } from "../../services/tenant/TenantInvitation.service.ts";

// The emailed token is 32 random bytes, hex
const token = z.string().regex(/^[0-9a-f]{64}$/, "Invalid invitation token");

const newAccountSchema = z.object({
    token,
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    // Same format as signup (auth.validator.ts)
    phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format"),
    password: z.string().min(8).max(128),
});

const existingAccountSchema = z.object({ token });

const ERRORS: Record<string, { status: number; message: string }> = {
    INVALID_OR_EXPIRED_INVITATION: { status: 404, message: "This invitation is invalid, used or expired" },
    EMAIL_MISMATCH: { status: 403, message: "This invitation was sent to a different email address" },
    ACCOUNT_EXISTS: { status: 409, message: "An account with this email exists: sign in, then accept the invitation" },
    PHONE_ALREADY_REGISTERED: { status: 409, message: "This phone number is already registered" },
    USER_ALREADY_MEMBER: { status: 409, message: "You are already a member of this business" },
};

function errorResponse(res: Response, error: any) {
    const limited = planLimitErrorResponse(res, error);
    if (limited) return limited;

    const known = ERRORS[error?.message];
    if (known) {
        return res.status(known.status).json({ success: false, error: error.message, message: known.message });
    }

    logWithContext("error", "[Invitation] Accept failed", { error: error?.message });
    return res.status(500).json({ success: false, error: "ACCEPT_FAILED" });
}

function validationError(res: Response, error: z.ZodError) {
    return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        details: error.issues.map((e) => ({ field: e.path.join("."), message: e.message })),
    });
}

export class InvitationController {

    // POST /api/invitations/accept
    // Public: creates the account for the invited email and joins the business
    static async acceptWithNewAccount(req: Request, res: Response) {
        const parsed = newAccountSchema.safeParse(req.body);
        if (!parsed.success) return validationError(res, parsed.error);

        try {
            const { token, ...newUser } = parsed.data;
            const result = await TenantInvitationService.acceptInvitation({ token, newUser });
            return res.status(201).json({ success: true, data: result });
        } catch (error: any) {
            return errorResponse(res, error);
        }
    }

    // POST /api/invitations/accept/existing
    // Signed in: joins the business as the current user, whose email must
    // be the invited one
    static async acceptAsCurrentUser(req: Request, res: Response) {
        const parsed = existingAccountSchema.safeParse(req.body);
        if (!parsed.success) return validationError(res, parsed.error);

        try {
            const result = await TenantInvitationService.acceptInvitation({
                token: parsed.data.token,
                userUuid: req.user!.userUuid,
            });
            return res.status(200).json({ success: true, data: result });
        } catch (error: any) {
            return errorResponse(res, error);
        }
    }
}
