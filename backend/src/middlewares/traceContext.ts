import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

//schema-create
export function traceContext(req: Request, res: Response, next: NextFunction) {
  const headerTraceId = req.headers["x-trace-id"] ?? req.headers["x-request-id"];
  const traceId =
    (Array.isArray(headerTraceId) ? headerTraceId[0] : headerTraceId) ?? randomUUID();

  req.traceId = traceId;
  res.setHeader("x-trace-id", traceId);

  next();
}


//globally using
//app.use(traceContext);