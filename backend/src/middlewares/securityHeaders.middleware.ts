import type { Request, Response, NextFunction } from "express";

export const securityHeadersMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    // Prevent clickjacking
    res.setHeader("X-Frame-Options", "DENY");

    // Prevent MIME sniffing
    res.setHeader("X-Content-Type-Options", "nosniff");

    // Enable XSS protection
    res.setHeader("X-XSS-Protection", "1; mode=block");

    // Referrer policy
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

    // Content Security Policy
    res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
    );

    // HSTS (only in production)
    if (process.env.NODE_ENV === "production") {
        res.setHeader(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains"
        );
    }

    // Permissions policy
    res.setHeader(
        "Permissions-Policy",
        "geolocation=(), microphone=(), camera=()"
    );

    next();
};