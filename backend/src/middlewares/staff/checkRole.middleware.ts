import type { Request, Response, NextFunction } from "express";
import type { StoreRole } from "@prisma/client";
import { checkRole } from "../checkRole.middleware.ts";

//Check if user has specific role at store
//
// Delegates to checkRole, which verifies the named store belongs to the
// current tenant and reads the user's role there (the old version trusted
// any storeUuid the client sent and never checked the tenant).
export function checkStoreRole(allowedRoles: string[]) {
    const check = checkRole(allowedRoles);
    return (req: Request, res: Response, next: NextFunction) =>
        check(req, res, () => {
            // Attach role to request for use in controller
            if (req.storeRole) req.staffRole = req.storeRole as StoreRole;
            next();
        });
}
