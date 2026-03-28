import type { Request, Response, NextFunction } from "express";

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const requestId = req.headers["x-request-id"] as string || `req_${Date.now()}_${Math.random().toString(36)}`;
    
    req.requestId = requestId;
    res.set("X-Request-ID", requestId);
    
    next();
};