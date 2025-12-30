

export type Role = "CUSTOMER" | "STAFF" | "ADMIN";

export interface JwtPayload {
  userId: string;
  role: Role;
};

export interface AccessTokenPayload {
  userUuid: string;
  role: string;
  storeUuid: string; 
};

export interface RefreshTokenPayload {
  userUuid: string;
};
