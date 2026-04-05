import { JwtPayload } from "./auth.types";
import { Tenant, TenantUser, User } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userUuid: string;
        role: string;
        tenantUuid?: string;
        storeUuid?: string;
        tokenVersion: number;
      };
    }
    interface Request {
      user?: User & {
        uuid: string;
        email: string;
        tenantUserUuid?: string;
        role?: string;
      };
      tenant?: Tenant;
      tenantUser?: TenantUser;
      store?: {
        uuid: string;
        name: string;
      };
      requestId?: string;
    }
  }
}
