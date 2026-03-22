import { Request, Response } from "express";
import { IPWhitelistService } from "../../services/security/IpWhitelist.service.ts";

 
export class IPWhitelistController {
  // GET /api/v1/security/ip-whitelist
  static async list(req: Request, res: Response) {
    try {
      const tenantUuid = (req as any).user?.tenantUuid;
      const ips = await IPWhitelistService.listIPs(tenantUuid);
      return res.status(200).json({ success: true, data: ips });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: "FETCH_FAILED" });
    }
  }
 
  // POST /api/v1/security/ip-whitelist
  static async add(req: Request, res: Response) {
    try {
      const staff = (req as any).user;
      const { ipAddress, ipRange, description, allowedFor, expiresAt } = req.body;
 
      if (!ipAddress && !ipRange) {
        return res.status(400).json({
          success: false,
          error: "ipAddress or ipRange required",
        });
      }
 
      const whitelist = await IPWhitelistService.addIP({
        tenantUuid: staff.tenantUuid,
        ipAddress,
        ipRange,
        description,
        allowedFor: allowedFor || ["*"],
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        addedBy: staff.uuid,
      });
 
      return res.status(201).json({ success: true, data: whitelist });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: "ADD_FAILED" });
    }
  }
 
  // DELETE /api/v1/security/ip-whitelist/:uuid
  static async remove(req: Request, res: Response) {
    try {
      const staff = (req as any).user;
      const { uuid } = req.params;
 
      await IPWhitelistService.removeIP({
        tenantUuid: staff.tenantUuid,
        whitelistUuid: uuid,
        removedBy: staff.uuid,
      });
 
      return res.status(200).json({ success: true, message: "IP removed" });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: "REMOVE_FAILED" });
    }
  }
 
  // POST /api/v1/security/ip-whitelist/check
  static async check(req: Request, res: Response) {
    try {
      const tenantUuid = (req as any).user?.tenantUuid;
      const { ipAddress, operation } = req.body;
 
      const isWhitelisted = await IPWhitelistService.isIPWhitelisted({
        tenantUuid,
        ipAddress: ipAddress || req.ip || "",
        operation: operation || "*",
      });
 
      return res.status(200).json({
        success: true,
        data: { ipAddress: ipAddress || req.ip, isWhitelisted },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: "CHECK_FAILED" });
    }
  }
}