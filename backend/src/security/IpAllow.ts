import type { Request, Response, NextFunction } from "express"

const ALLOWED_IPS = [
    "127.0.0.1",
    "192.168.1.10",
  ];
  
export const adminIpAllowlist = (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    if (!ALLOWED_IPS.includes(req.ip)) {
      return res.status(403).json({ message: "IP not allowed" });
    }
    next();
};
  