import type { Request, Response, NextFunction } from "express";

export const getStoreScope = (req: Request) => {
    if (req.user.role === "SUPER_ADMIN") {
      return {}; 
    }
  
    return { storeUuid: req.user.storeUuid };
};