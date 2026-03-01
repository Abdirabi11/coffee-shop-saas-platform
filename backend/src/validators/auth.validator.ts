import { z } from "zod";

export const requestSignupOtpSchema = z.object({
    phoneNumber: z
        .string()
        .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format"),
    method: z.enum(["SMS", "EMAIL"]).optional(),
    email: z.string().email().optional(),
});

export const verifySignupSchema = z.object({
    phoneNumber: z
        .string()
        .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format"),
    code: z.string().length(6, "OTP must be 6 digits"),
    name: z.string().min(2).max(100).optional(),
    email: z.string().email().optional(),
});

export const requestLoginOtpSchema = z.object({
    phoneNumber: z
        .string()
        .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format"),
});

export const verifyLoginOtpSchema = z.object({
    attemptUuid: z.string().uuid(),
    code: z.string().length(6, "OTP must be 6 digits"),
});

export const refreshTokenSchema = z.object({
    refreshToken: z.string().optional(), // Optional because it can come from cookie
});