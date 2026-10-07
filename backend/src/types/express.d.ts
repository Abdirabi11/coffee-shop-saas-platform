import type { StoreRole, Tenant, TenantUser } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      // Set by middlewares/auth.middleware.ts `authenticate` — this is exactly
      // the decoded JWT access-token payload (see AccessTokenPayload in
      // types/auth.types.ts). It does NOT carry `uuid`/`email` (only
      // `userUuid`) and does NOT carry `tenantUserUuid` — that lives on
      // `req.tenantUser.uuid` instead, set separately below.
      user?: {
        userUuid: string;
        role: string; // globalRole at login; never use it to authorize
        globalRole?: string; // from the DB, set by authenticate
        tenantUuid?: string;
        storeUuid?: string;
        tokenVersion: number;
      };

      // Set by authorize / authorizeAt / authorizeOrder / checkRole: the
      // roles verified for this request (tenant + store in context), and
      // whether they amount to staff access rather than plain membership
      access?: {
        roles: string[];
        staff: boolean;
      };

      // Set by middlewares/requireTenantContext.middleware.ts — only present
      // on routes that run that middleware after `authenticate`.
      tenant?: Tenant;
      tenantUser?: TenantUser;

      storeRole?: string;
      store?: {
        uuid: string;
        name: string;
      };

      // Set by middlewares/deviceFingerprint.middleware.ts
      deviceId?: string;
      deviceTrusted?: boolean;

      // Set by middlewares/menu/requireTenantHeader.middleware.ts on public
      // routes. Unauthenticated header value — never use it to authorize.
      tenantUuid?: string;

      // Set by middlewares/ensureTenantIsolation.ts
      prismaFilter?: { tenantUuid: string };

      // Set by middlewares/staff/checkRole.middleware.ts
      staffRole?: StoreRole;

      // Set by middlewares/staff/requireClockIn.ts
      clockInWarning?: boolean;

      // Set by middlewares/staff/validateGeofence.ts
      geofenceViolation?: boolean;
      distanceFromStore?: number;

      // Set by middlewares/menu/cache.controller.ts
      menuVersion?: string;

      // Set by middlewares/traceContext.ts
      traceId?: string;

      rawBody?: Buffer;
      requestId?: string;
    }
  }
}
