import type { Request, Response, NextFunction } from "express";
import Joi from "joi";
import { logWithContext } from "../../infrastructure/observability/logger.ts";

export function validateRequest(schema: Joi.Schema, source: "body" | "query" | "params" = "body") {
    return (req: Request, res: Response, next: NextFunction) => {
        const data = req[source];

        const { error, value } = schema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
            convert: true,
        });

        if (error) {
            logWithContext("warn", "[Validation] Request validation failed", {
                path: req.path,
                errors: error.details,
            });

            return res.status(400).json({
                error: "VALIDATION_ERROR",
                message: "Invalid request data",
                details: error.details.map((d) => ({
                    field: d.path.join("."),
                    message: d.message,
                    type: d.type,
                })),
            });
        }

        // Replace request data with validated & sanitized data
        req[source] = value;

        next();
    };
}