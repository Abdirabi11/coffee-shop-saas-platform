import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

//schema-create
export function traceContext(req: Request, res: Response, next: NextFunction) {
  const traceId =
    req.headers["x-trace-id"] ??
    req.headers["x-request-id"] ??
    randomUUID();

  req.traceUuid = traceUuid;
  res.setHeader("x-trace-id", traceId);

  next();
}

//globally using
//app.use(traceContext);