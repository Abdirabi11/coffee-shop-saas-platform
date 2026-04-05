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

  // Sanitize query params (read-only — mutate in place)
  if (req.query && typeof req.query === "object") {
    for (const key of Object.keys(req.query)) {
      if (typeof req.query[key] === "string") {
        (req.query as any)[key] = validator.escape(req.query[key] as string).trim();
      }
    }
  }

  // Sanitize URL params (read-only — mutate in place)
  if (req.params && typeof req.params === "object") {
    for (const key of Object.keys(req.params)) {
      if (typeof req.params[key] === "string") {
        req.params[key] = validator.escape(req.params[key]).trim();
      }
    }
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
      if (key.startsWith("__") || key.startsWith("$")) continue;
      if (typeof value === "string") {
        sanitized[key] = validator.escape(value).trim();
      } else {
        sanitized[key] = sanitizeObject(value);
      }
    }
    return sanitized;
  }

  return obj;
}