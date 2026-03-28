import type { Request, Response, NextFunction } from "express";
import validator from "validator";


export const sanitizeInput = (
        req: Request,
        res: Response,
        next: NextFunction
    ) => {
    // Sanitize body
    if (req.body && typeof req.body === "object") {
        req.body = sanitizeObject(req.body);
    }
  
    // Sanitize query params
    if (req.query && typeof req.query === "object") {
        req.query = sanitizeObject(req.query);
    }
  
    // Sanitize URL params
    if (req.params && typeof req.params === "object") {
        req.params = sanitizeObject(req.params);
    }
  
    next();
};
  
  function sanitizeObject(obj: any): any {
    if (Array.isArray(obj)) {
        return obj.map((item) => sanitizeObject(item));
    }
  
    if (typeof obj === "object" && obj !== null) {
        const sanitized: any = {};
    
        for (const [key, value] of Object.entries(obj)) {
            // Skip special keys
            if (key.startsWith("__") || key.startsWith("$")) {
                continue;
            }
    
            if (typeof value === "string") {
                // Escape HTML
                sanitized[key] = validator.escape(value);
        
                // Trim whitespace
                sanitized[key] = sanitized[key].trim();
            } else {
                sanitized[key] = sanitizeObject(value);
            }
        }
        
        return sanitized;
    }
  
    return obj;
}