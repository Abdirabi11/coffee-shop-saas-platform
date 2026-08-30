import rateLimit from "express-rate-limit";

export const menuRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: {
        error: "TOO_MANY_REQUESTS",
        message: "Too many menu requests, please try again later",
    },
    standardHeaders: true,
    legacyHeaders: false,
});

export const searchRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: {
        error: "TOO_MANY_REQUESTS",
        message: "Too many search requests, please try again later",
    },
});