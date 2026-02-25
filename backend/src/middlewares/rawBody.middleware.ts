import { Request, Response, NextFunction } from "express";

export const rawBodyMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    // Only for webhook endpoints
    if (!req.path.includes("/webhooks/")) {
        return next();
    }

    let data = "";

    req.setEncoding("utf8");

    req.on("data", (chunk) => {
        data += chunk;
    });

    req.on("end", () => {
        req.rawBody = data;
        next();
    });
};

// Usage in app.ts:
// app.use(rawBodyMiddleware);
// app.use(express.json()); // After raw body
