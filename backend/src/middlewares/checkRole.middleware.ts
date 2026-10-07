import { accessMiddleware, storeFromRequest, type StoreResolver } from "./auth.middleware.ts";

// Store-scoped role check. The user must hold one of the roles at the store
// (or a tenant-wide role that implies it, e.g. TENANT_ADMIN → ADMIN; see
// authorize in auth.middleware.ts), and the store must belong to the
// verified tenant.
//
// By default the store is the one the request names (param, query or body).
// That is only safe when the handler acts on that same store. For routes
// that act on a resource (an order, a payment), pass a resolver that returns
// the resource's own store, e.g. checkRole(["CASHIER"], storeOf.order("orderUuid", "body")):
// otherwise a cashier at store X could name X and act on store Y's resource.
export const checkRole = (allowedRoles: string[], storeFrom?: StoreResolver) =>
    accessMiddleware(allowedRoles, storeFrom
        ? { resolve: storeFrom, whenMissing: "404" }
        : { resolve: storeFromRequest, whenMissing: "400" });
