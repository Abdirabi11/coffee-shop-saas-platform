import type { Request, Response, NextFunction } from "express";
import { logger } from "../infrastructure/observability/Logger.ts";

interface HttpError extends Error {
  statusCode?: number;
  status?: number;
  code?: string;
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
    requestId: req.requestId,
  });
}

// Express only treats a middleware as an error handler when it declares
// exactly 4 parameters — `next` must stay even though it's unused.
export function errorHandler(
  err: HttpError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) {
  const statusCode = err.statusCode ?? err.status ?? 500;
  const isServerError = statusCode >= 500;
  const isProduction = process.env.NODE_ENV === "production";

  logger.error({
    msg: "Unhandled request error",
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode,
    errorName: err.name,
    errorCode: err.code,
    errorMessage: err.message,
    stack: err.stack,
  });

  const message =
    isServerError && isProduction
      ? "An unexpected error occurred. Please try again later."
      : err.message || "An error occurred";

  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code ?? (isServerError ? "INTERNAL_ERROR" : "REQUEST_ERROR"),
      message,
      ...(isProduction ? {} : { stack: err.stack?.split("\n") }),
    },
    requestId: req.requestId,
  });
}
