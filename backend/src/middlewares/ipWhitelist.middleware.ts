import { Request, Response, NextFunction } from "express";
import { logWithContext } from "../infrastructure/observability/Logger.ts";
import { IPWhitelistService } from "../services/security/IpWhitelist.service.ts";

export const requireIPWhitelist = (operation: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const tenantUuid = req.tenant?.uuid;
            const ipAddress = req.ip!;
  
            if (!tenantUuid) {
                return res.status(403).json({
                    error: "TENANT_REQUIRED",
                    message: "Tenant context required",
                });
            }
  
            // Check if IP is whitelisted
            const isWhitelisted = await IPWhitelistService.isIPWhitelisted({
                tenantUuid,
                ipAddress,
                operation,
            });
  
            if (!isWhitelisted) {
                logWithContext("warn", "[IPWhitelist] Access denied", {
                    tenantUuid,
                    ipAddress,
                    operation,
                });
        
                return res.status(403).json({
                    error: "IP_NOT_WHITELISTED",
                    message: "Your IP address is not authorized for this operation",
                });
            };
    
            next();
  
        } catch (error: any) {
            logWithContext("error", "[IPWhitelist] Middleware error", {
                error: error.message,
            });
    
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "IP whitelist check failed",
            });
        }
    };
};