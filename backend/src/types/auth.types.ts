

export type Role = "CUSTOMER" | "STAFF" | "ADMIN";

export interface JwtPayload {
  userId: string;
  role: Role;
};

export interface AccessTokenPayload {
  userUuid: string;
  role: StoreRole | "SUPER_ADMIN";
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
