import type { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma.ts"
import { verifyAccessToken } from "../utils/jwt.ts";
import { requireTenantContext } from "./requireTenantContext.middleware.ts";

export interface AuthRequest extends Request {
    user?: {
        userUuid: string;
        role: string;
        tenantUuid?: string;
        globalRole?: string;
        storeUuid?: string;
        tokenVersion: number;
    };
};

export const authenticate= async (
    req: Request,
    res: Response,
    next: NextFunction
)=>{
    try {
        const authHeader= req.headers.authorization;
        // console.log("AUTH HEADER:", req.headers.authorization);
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ message: "Unauthorized" });
        };

        const token= authHeader.split(" ")[1];
        const payload = verifyAccessToken(token);
        // console.log("DECODED PAYLOAD:", payload);
        // // console.log("USER UUID:", payload?.userUuid);

        const user= await prisma.user.findUnique({
            where: { uuid: payload.userUuid },
            select: { tokenVersion: true, isBanned: true, globalRole: true },
        });
        if (!user || user.isBanned) {
            return res.status(401).json({ message: "Account blocked" });
        };

        if (payload.tokenVersion !== user.tokenVersion) {
            return res.status(401).json({ message: "Token revoked" });
        };
        
        // globalRole from the DB, not the token: it decides SUPER_ADMIN
        // access, and a demotion must apply without waiting for re-login
        req.user = { ...payload, globalRole: user.globalRole };
        next()
    } catch (err: any) {
        console.log("JWT ERROR:", err.message);
        return res.status(401).json({ message: "Invalid or expired token" });
    } 
};

// ── Authorization ───────────────────────────────────────────────────────────
// Roles come from verified records for the current tenant, never from the
// token's `role` claim. That claim is the user's globalRole, which says
// nothing about a tenant (invited staff are all "CUSTOMER" there) and stays
// the same when x-tenant-uuid switches tenants.
//
//   SUPER_ADMIN                  User.globalRole (read from the DB by authenticate)
//   OWNER                        Tenant.ownerUuid
//   TENANT_ADMIN, REGIONAL_MANAGER, STAFF
//                                TenantUser.role in the current tenant
//   CUSTOMER                     any active member of the current tenant
//   ADMIN, MANAGER, CASHIER, ... UserStore.role at the store in context
//
// OWNER and TENANT_ADMIN also count as ADMIN (tenant-wide), STORE_MANAGER as
// MANAGER. Store roles count only when the request names a store, that store
// belongs to the current tenant, and the user is actively assigned to it.

type RoleList = Array<string | string[]>;
export type StoreResolver = (req: Request) => Promise<string | null | undefined> | string | null | undefined;

const TENANT_STAFF_ROLES = new Set(["OWNER", "TENANT_ADMIN", "ADMIN", "REGIONAL_MANAGER"]);
const STORE_ROLE_ALIASES: Record<string, string[]> = { STORE_MANAGER: ["MANAGER"] };

// authorize("A", "B") and authorize(["A", "B"]) both work; routes use both
export const flattenRoles = (roles: RoleList) => roles.flat();

const stringParam = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : undefined);

// The store a request names: route param first, then query, then body
export const storeFromRequest: StoreResolver = (req) =>
    stringParam(req.params?.storeUuid) ?? stringParam(req.query?.storeUuid) ?? stringParam(req.body?.storeUuid);

// Resolvers for routes that act on a resource: the store is the resource's
// own store (looked up within the current tenant), not whatever the client
// sends. null means the resource isn't in this tenant.
export const storeOf = {
    order: (param = "orderUuid", from: "params" | "body" = "params"): StoreResolver => async (req) => {
        const uuid = stringParam(from === "params" ? req.params?.[param] : req.body?.[param]);
        if (!uuid || !req.tenant) return null;
        const order = await prisma.order.findFirst({
            where: { uuid, tenantUuid: req.tenant.uuid },
            select: { storeUuid: true },
        });
        return order?.storeUuid ?? null;
    },
    payment: (param = "paymentUuid"): StoreResolver => async (req) => {
        const uuid = stringParam(req.params?.[param]);
        if (!uuid || !req.tenant) return null;
        const payment = await prisma.payment.findFirst({
            where: { uuid, tenantUuid: req.tenant.uuid },
            select: { storeUuid: true },
        });
        return payment?.storeUuid ?? null;
    },
};

// Run a middleware inline; resolves true if it called next(), false if it
// answered the request itself
function runMiddleware(
    mw: (req: Request, res: Response, next: NextFunction) => unknown,
    req: Request,
    res: Response
): Promise<boolean> {
    return new Promise((resolve, reject) => {
        Promise.resolve(mw(req, res, (err?: unknown) => (err ? reject(err) : resolve(true))))
            .then(() => resolve(false), reject);
    });
}

// Tenant-level roles, plus store-level roles when storeUuid is given.
// Requires req.tenant / req.tenantUser (requireTenantContext). `staff` means
// more than plain membership: a tenant-level staff role or an assignment at
// the store (StoreRole STAFF shares its name with TenantRole STAFF, which
// customers also have, so the role names alone can't tell).
export async function resolveRoles(req: Request, storeUuid?: string): Promise<{ roles: Set<string>; staff: boolean }> {
    const roles = new Set<string>(["CUSTOMER"]);
    let assigned = false;
    if (req.tenantUser?.role) roles.add(req.tenantUser.role);
    if (req.tenant?.ownerUuid === req.user!.userUuid) roles.add("OWNER");
    if (roles.has("OWNER") || roles.has("TENANT_ADMIN")) {
        roles.add("TENANT_ADMIN");
        roles.add("ADMIN");
    }

    if (storeUuid && req.tenant) {
        const assignment = await prisma.userStore.findFirst({
            where: { userUuid: req.user!.userUuid, storeUuid, tenantUuid: req.tenant.uuid, isActive: true },
            select: { role: true },
        });
        if (assignment) {
            assigned = true;
            roles.add(assignment.role);
            for (const alias of STORE_ROLE_ALIASES[assignment.role] ?? []) roles.add(alias);
            req.storeRole = assignment.role;
        }
    }
    return { roles, staff: assigned || [...roles].some((r) => TENANT_STAFF_ROLES.has(r)) };
}

type AccessOutcome = { ok: true } | { ok: false; status: number; body: Record<string, string> };

async function checkAccess(
    req: Request,
    res: Response,
    allowed: string[],
    store: StoreRule
): Promise<AccessOutcome | null> {
    if (!req.user) return { ok: false, status: 401, body: { message: "Unauthorized" } };

    if (req.user.globalRole === "SUPER_ADMIN") {
        req.access = { roles: ["SUPER_ADMIN"], staff: true };
        return { ok: true };
    }

    // Routers that skip requireTenantContext still get a verified tenant
    if (req.tenant === undefined && !(await runMiddleware(requireTenantContext, req, res))) {
        return null; // requireTenantContext already answered
    }
    if (!req.tenant || !req.tenantUser) {
        return { ok: false, status: 403, body: { message: "Forbidden", error: "NO_TENANT_ACCESS" } };
    }

    const storeUuid = stringParam(await store.resolve(req));
    if (!storeUuid && store.whenMissing === "400") {
        return { ok: false, status: 400, body: { error: "MISSING_STORE_CONTEXT", message: "Store context is required" } };
    }
    if (!storeUuid && store.whenMissing === "404") {
        return { ok: false, status: 404, body: { error: "NOT_FOUND", message: "Resource not found" } };
    }
    if (storeUuid) {
        const verified = await prisma.store.findFirst({
            where: { uuid: storeUuid, tenantUuid: req.tenant.uuid },
            select: { uuid: true, name: true },
        });
        // Same answer for "other tenant's store" and "no such store"
        if (!verified) return { ok: false, status: 404, body: { error: "STORE_NOT_FOUND", message: "Store not found" } };
        req.store = verified;
    }

    const { roles, staff } = await resolveRoles(req, storeUuid);
    req.access = { roles: [...roles], staff };

    if (!allowed.some((role) => roles.has(role))) {
        return { ok: false, status: 403, body: { message: "Forbidden", error: "INSUFFICIENT_ROLE" } };
    }
    return { ok: true };
}

// Where the store comes from, and what a missing one means: "optional"
// (tenant-level roles only), "400" (client must name a store) or "404" (the
// resource the store comes from isn't in this tenant)
export type StoreRule = { resolve: StoreResolver; whenMissing: "optional" | "400" | "404" };

export function accessMiddleware(allowed: string[], store: StoreRule) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const outcome = await checkAccess(req, res, allowed, store);
            if (!outcome) return;
            if (!outcome.ok) return res.status(outcome.status).json(outcome.body);
            next();
        } catch (error: any) {
            console.error("[authorize] Error:", error.message);
            return res.status(500).json({ error: "INTERNAL_ERROR", message: "Authorization failed" });
        }
    };
}

// Allow if the user holds any of the roles in the current tenant, or at the
// store the request names (which must belong to the tenant).
export const authorize = (...allowedRoles: RoleList) =>
    accessMiddleware(flattenRoles(allowedRoles), { resolve: storeFromRequest, whenMissing: "optional" });

// Same, with the store taken from a resolver, e.g. the store of the order or
// payment being acted on. 404 if that resource isn't in the tenant.
export const authorizeAt = (storeFrom: StoreResolver, ...allowedRoles: RoleList) =>
    accessMiddleware(flattenRoles(allowedRoles), { resolve: storeFrom, whenMissing: "404" });

// For routes on a single order. Staff roles are checked at the order's own
// store; CUSTOMER (if allowed) only passes for the customer who placed it.
export const authorizeOrder = (...allowedRoles: RoleList) => {
    const allowed = flattenRoles(allowedRoles);
    const staffRoles = allowed.filter((r) => r !== "CUSTOMER");
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (req.user?.globalRole === "SUPER_ADMIN") {
                req.access = { roles: ["SUPER_ADMIN"], staff: true };
                return next();
            }
            if (req.tenant === undefined && !(await runMiddleware(requireTenantContext, req, res))) return;
            if (!req.user || !req.tenant || !req.tenantUser) {
                return res.status(403).json({ message: "Forbidden", error: "NO_TENANT_ACCESS" });
            }

            const order = await prisma.order.findFirst({
                where: { uuid: stringParam(req.params?.orderUuid) ?? "", tenantUuid: req.tenant.uuid },
                select: { storeUuid: true, tenantUserUuid: true },
            });
            if (!order) return res.status(404).json({ error: "ORDER_NOT_FOUND", message: "Order not found" });

            const { roles, staff } = await resolveRoles(req, order.storeUuid);
            req.access = { roles: [...roles], staff };

            if (staffRoles.some((role) => roles.has(role))) return next();
            if (allowed.includes("CUSTOMER") && order.tenantUserUuid === req.tenantUser.uuid) {
                req.access.staff = false; // acting as the order's customer
                return next();
            }
            return res.status(403).json({ error: "FORBIDDEN", message: "You don't have access to this order" });
        } catch (error: any) {
            console.error("[authorizeOrder] Error:", error.message);
            return res.status(500).json({ error: "INTERNAL_ERROR", message: "Authorization failed" });
        }
    };
};

export const requireStoreContext = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user?.storeUuid) {
      return res.status(400).json({ message: "Store context required" });
    }
    next();
};

export const require2FA= async(req: AuthRequest, res: Response, next: NextFunction)=>{
    if (!req.user) {
        return res.status(401).json({ message: "Unauthenticated" });
    };

    const record= await prisma.admin2FA.findUnique({
        where: { userUuid: req.user!.userUuid },
    });

    if (!record?.enabled) {
        return res.status(403).json({ message: "2FA required" });
    };
    
    next();
};

export const requireStoreAccess =
  (storeParam = "storeUuid") =>
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const storeUuid = req.params[storeParam];

    const access = await prisma.userStore.findFirst({
      where: {
        userUuid: req.user!.userUuid,
        storeUuid,
        isActive: true,
      },
    });

    if (!access) {
      return res.status(403).json({ message: "Store access denied" });
    }

    next();
};

export const enforceStoreLimit = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const tenantUuid= req.user!.tenantUuid;

    const tenant= await prisma.tenant.findUnique({
        where: {uuid: tenantUuid},
        include: {
            stores: true,
            subscription: { include: { plan: true } },
        }
    });

    if (!tenant?.subscription?.plan) {
        return res.status(403).json({ message: "No active subscription" });
    };

    if (tenant.stores.length >= tenant.maxStores) {
        return res.status(403).json({ message: "Store limit reached" });
    };

    next();
};
