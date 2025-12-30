import jwt from "jsonwebtoken";
import type { RefreshTokenPayload, AccessTokenPayload } from "../types/auth.types.ts";


const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET!;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET!;
 
export const signAccessToken = (payload: AccessTokenPayload) => {
    return jwt.sign(payload, ACCESS_TOKEN_SECRET, {
        expiresIn: "15m",
    });
};
  
export const signRefreshToken = (payload: RefreshTokenPayload) => {
    return jwt.sign(payload, REFRESH_TOKEN_SECRET, {
        expiresIn: "7d",
    });
};
  
export const verifyAccessToken = (token: string): AccessTokenPayload => {
    return jwt.verify(token, ACCESS_TOKEN_SECRET) as AccessTokenPayload;
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
    return jwt.verify(token, REFRESH_TOKEN_SECRET) as RefreshTokenPayload;
};