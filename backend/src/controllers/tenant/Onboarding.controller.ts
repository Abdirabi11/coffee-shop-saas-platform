import type { Request, Response } from "express";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { planLimitErrorResponse } from "../../services/billing/PlanLimit.service.ts";
import { OnboardingError, TenantOnboardingService } from "../../services/tenant/TenantOnboarding.service.ts";

function fail(res: Response, error: any, action: string) {
    if (error instanceof OnboardingError) {
        const [, detail] = error.message.split(/:\s(.+)/);
        return res.status(error.status).json({ success: false, error: error.code, ...(detail && { message: detail }) });
    }
    const planAnswer = planLimitErrorResponse(res, error);
    if (planAnswer) return planAnswer;

    logWithContext("error", `[Onboarding] ${action} failed`, { error: error.message });
    return res.status(500).json({ success: false, error: `${action.toUpperCase().replace(/\s+/g, "_")}_FAILED` });
}

export class OnboardingController {
    // POST /api/tenant
    // Body: { name, email?, phone?, businessName?, industry? }
    // The caller becomes the owner and TENANT_ADMIN. Next: subscribe
    // (POST /api/subscriptions), then add stores (POST /api/store).
    static async createTenant(req: Request, res: Response) {
        try {
            const body = req.body ?? {};
            const { tenant, tenantUser } = await TenantOnboardingService.createTenant({
                userUuid: req.user!.userUuid,
                name: body.name,
                email: body.email,
                phone: body.phone,
                businessName: body.businessName,
                industry: body.industry,
            });
            return res.status(201).json({
                success: true,
                data: {
                    tenant,
                    membership: { uuid: tenantUser.uuid, role: tenantUser.role },
                    // Send as x-tenant-uuid when the account belongs to more than one tenant
                    tenantUuid: tenant.uuid,
                    nextStep: "SUBSCRIBE",
                },
            });
        } catch (error: any) {
            return fail(res, error, "Create tenant");
        }
    }

    // POST /api/store
    // Body: { name, city, address?, timezone? (IANA, default UTC), description?,
    //         phone?, email?, latitude?, longitude? }
    // The store opens for orders once its hours are set.
    static async createStore(req: Request, res: Response) {
        try {
            const body = req.body ?? {};
            const store = await TenantOnboardingService.createStore({
                tenantUuid: req.tenant!.uuid,
                createdBy: req.user!.userUuid,
                name: body.name,
                city: body.city,
                address: body.address,
                timezone: body.timezone,
                description: body.description,
                phone: body.phone,
                email: body.email,
                latitude: body.latitude,
                longitude: body.longitude,
            });
            return res.status(201).json({ success: true, data: store });
        } catch (error: any) {
            return fail(res, error, "Create store");
        }
    }

    // PATCH /api/store/:storeUuid
    // Any of: name, city, address, timezone, description, phone, email,
    // latitude, longitude (null clears an optional field's coordinates)
    static async updateStore(req: Request, res: Response) {
        try {
            const body = req.body ?? {};
            const store = await TenantOnboardingService.updateStore({
                tenantUuid: req.tenant!.uuid,
                storeUuid: String(req.params.storeUuid),
                updatedBy: req.user!.userUuid,
                name: body.name,
                city: body.city,
                address: body.address,
                timezone: body.timezone,
                description: body.description,
                phone: body.phone,
                email: body.email,
                latitude: body.latitude,
                longitude: body.longitude,
            });
            return res.status(200).json({ success: true, data: store });
        } catch (error: any) {
            return fail(res, error, "Update store");
        }
    }
}
