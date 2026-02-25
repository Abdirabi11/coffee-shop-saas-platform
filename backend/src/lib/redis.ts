import { Redis } from "@upstash/redis";
import {REDIS_URL, REDIS_TOKEN} from "../config/env.ts"
import Redis from "ioredis";
import { Redis as UpstashRedis } from "@upstash/redis";

export const redisClient = new Redis({
  url: REDIS_URL,
  token: REDIS_TOKEN,
});




// Check if using Upstash (serverless)
const isUpstash = !!process.env.UPSTASH_REDIS_URL;

// Create appropriate client
export const redis = isUpstash
  ? new UpstashRedis({
      url: process.env.UPSTASH_REDIS_URL!,
      token: process.env.UPSTASH_REDIS_TOKEN!,
    })
  : new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || "0"),
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

// Export type-safe client
export type RedisClient = typeof redis;


// Use THIS if deploying to:
// - Vercel
// - Netlify
// - AWS Lambda
// - Any serverless platform

// import { Redis } from "@upstash/redis";

// export const redis = new Redis({
//   url: process.env.UPSTASH_REDIS_URL!,
//   token: process.env.UPSTASH_REDIS_TOKEN!,
// });

// // Usage
// await redis.set("key", "value");
// await redis.get("key");


