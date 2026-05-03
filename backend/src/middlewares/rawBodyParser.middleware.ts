import type { Request, Response, NextFunction } from "express";
import express from "express"


export const rawBodyParser = express.raw({
    type: "application/json",
    limit: "5mb",
    verify: (req: Request, _res: Response, buf: Buffer) => {
        (req as any).rawBody = buf;
    },
});