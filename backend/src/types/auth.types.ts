import type { StoreRole, GlobalRole } from "@prisma/client";

export type Role = "CUSTOMER" | "STAFF" | "ADMIN";

export interface JwtPayload {
  userUuid: string;
  role: Role;
};

export interface AccessTokenPayload {
  userUuid: string;
  // StoreRole for store-scoped staff, GlobalRole (includes "SUPER_ADMIN") for platform-level users
  role: StoreRole | GlobalRole;
  tenantUuid?: string;
  storeUuid?: string;
  tokenVersion: number; 
};

export interface RefreshTokenPayload {
  userUuid: string;
};

export interface RefreshTokenPayload {
  userUuid: string;
  tokenVersion: number;
};

export interface AuthRequest extends Request {
  user?: {
    userUuid: string;
    role: string;
    tenantUuid?: string;
    storeUuid?: string;
    tokenVersion: number;
  };
}
