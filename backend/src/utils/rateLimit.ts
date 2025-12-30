import rateLimit from "express-rate-limit";

export const otpRequestLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 5,
    message: {
      message: "Too many OTP requests. Please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
});

export const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Too many admin requests",
});

export const sensitiveLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
});