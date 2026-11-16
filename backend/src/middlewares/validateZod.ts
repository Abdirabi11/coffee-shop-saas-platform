import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";

// Validates req.body (or req.query) against a Zod schema. On success the
// parsed value replaces the body, so unknown keys are dropped and defaults
// applied; on failure answers 400 with one entry per issue.
export function validateZod(schema: ZodType, source: "body" | "query" = "body") {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req[source] ?? {});
        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: "VALIDATION_ERROR",
                message: "Invalid request data",
                details: result.error.issues.map((issue) => ({
                    field: issue.path.join("."),
                    message: issue.message,
                })),
            });
        }
        if (source === "body") {
            req.body = result.data;
        } else {
            // Express 5: req.query is a getter; shadow it with the parsed value
            Object.defineProperty(req, "query", { value: result.data, writable: true, configurable: true });
        }
        next();
    };
}
