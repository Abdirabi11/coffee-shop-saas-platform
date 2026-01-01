import type { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma.ts"

export const maintenanceGuard = async (_: Request, res: Response, next: NextFunction) => {
    const setting = await prisma.platformSetting.findUnique({
      where: { key: "MAINTENANCE_MODE" },
    });
  
    if (setting?.value?.enabled) {
      return res.status(503).json({
        message: setting.value.message || "Service under maintenance",
      });
    }
  
    next();
};