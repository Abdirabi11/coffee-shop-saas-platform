import type { Request, Response, NextFunction } from "express";
import prisma from "../../config/prisma.ts";
import { authorize, ensureTenantContext } from "../auth.middleware.ts";
import { checkPermission } from "./checkPermission.middleware.ts";

// Payroll period routes (/payroll/:payrollPeriodUuid/...). The period must be
// in the verified tenant (404 otherwise). A store's period needs the
// permission at that store - the period's own store, never one the client
// names; a tenant-wide period (storeUuid null) needs a tenant admin.
export function checkPayrollPermission(permissionSlug: string, param = "payrollPeriodUuid") {
    const tenantWide = authorize("TENANT_ADMIN");

    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!(await ensureTenantContext(req, res))) return;

            const uuid = req.params?.[param];
            const period = typeof uuid === "string" && req.tenant
                ? await prisma.payrollPeriod.findFirst({
                    where: { uuid, tenantUuid: req.tenant.uuid },
                    select: { storeUuid: true },
                })
                : null;
            if (!period) {
                return res.status(404).json({ success: false, error: "PAYROLL_PERIOD_NOT_FOUND" });
            }

            const storeUuid = period.storeUuid;
            if (!storeUuid) return tenantWide(req, res, next);
            return checkPermission(permissionSlug, async () => storeUuid)(req, res, next);
        } catch {
            return res.status(500).json({ success: false, error: "PERMISSION_CHECK_FAILED" });
        }
    };
}
