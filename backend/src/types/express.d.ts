import type { Tenant, TenantUser } from "@prisma/client";

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
        role: string;
        tenantUuid?: string;
        storeUuid?: string;
        tokenVersion: number;
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

      rawBody?: Buffer;
      requestId?: string;
    }
  }
}
