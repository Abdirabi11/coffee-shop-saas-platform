import type { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma.ts"

export const idempotencyMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
 ) => {
    const key= req.headers["idempotency-key"] as string;
    if (!key) {
        return res.status(400).json({
          message: "Idempotency-Key header required",
        });
    };

    const route = req.method + req.originalUrl;

    const existing= await prisma.idempotencyKey.findUnique({
        where: {
            key_route: {
                key,
                route
            }
        }
    });

    if(existing){
        return res.status(existing.statusCode).json(existing.response);
    };

    const originalJson= res.json.bind(res);

    res.json = async (body: any) => {
        await prisma.idempotencyKey.create({
          data: {
            key,
            route,
            response: body,
            statusCode: res.statusCode,
          },
        });
    
        return originalJson(body);
    };

    next();
};

// Endpoint	Required
// /payments/confirm	✅
// /refunds	✅
// /retry-payment	✅
// Webhooks	✅