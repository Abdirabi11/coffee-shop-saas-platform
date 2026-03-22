import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { redis } from "../../lib/redis.js";


export const menuRateLimit = rateLimit({
    store: new RedisStore({
        client: redis,
        prefix: "rl:menu:",
    }),
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: {
        error: "TOO_MANY_REQUESTS",
        message: "Too many menu requests, please try again later",
    },
    standardHeaders: true,
    legacyHeaders: false,
});

export const searchRateLimit = rateLimit({
    store: new RedisStore({
        client: redis,
        prefix: "rl:search:",
    }),
    windowMs: 60 * 1000,
    max: 30, // 30 searches per minute
    message: {
        error: "TOO_MANY_REQUESTS",
        message: "Too many search requests, please try again later",
    },
});