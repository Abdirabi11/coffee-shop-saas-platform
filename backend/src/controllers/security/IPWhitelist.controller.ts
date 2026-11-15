import { Request, Response } from "express";
import { IPWhitelistService } from "../../services/security/IpWhitelist.service.ts";

 
export class IPWhitelistController {
  // GET /api/v1/security/ip-whitelist
  static async list(req: Request, res: Response) {
    try {
      // Verified tenant (requireTenantContext), not the login tenant on the token
      const tenantUuid = req.tenant?.uuid;
      if (!tenantUuid) {
        return res.status(400).json({ success: false, error: "TENANT_CONTEXT_REQUIRED" });
      }
      const ips = await IPWhitelistService.listIPs(tenantUuid);
      return res.status(200).json({ success: true, data: ips });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: "FETCH_FAILED" });
    }
  }
 
  // POST /api/v1/security/ip-whitelist
  // Body: exactly one of ipAddress ("203.0.113.7") or ipRange ("203.0.113.0/24")
  static async add(req: Request, res: Response) {
    try {
      const tenantUuid = req.tenant?.uuid;
      if (!tenantUuid) {
        return res.status(400).json({ success: false, error: "TENANT_CONTEXT_REQUIRED" });
      }
      const { ipAddress, ipRange, description, allowedFor, expiresAt } = req.body ?? {};

      if (allowedFor !== undefined && (!Array.isArray(allowedFor) || !allowedFor.every((v: unknown) => typeof v === "string"))) {
        return res.status(400).json({ success: false, error: "INVALID_ALLOWED_FOR" });
      }
      const expires = expiresAt ? new Date(expiresAt) : undefined;
      if (expires && Number.isNaN(expires.getTime())) {
        return res.status(400).json({ success: false, error: "INVALID_EXPIRES_AT" });
      }

      const whitelist = await IPWhitelistService.addIP({
        tenantUuid,
        ipAddress: typeof ipAddress === "string" ? ipAddress : undefined,
        ipRange: typeof ipRange === "string" ? ipRange : undefined,
        description,
        allowedFor: allowedFor?.length ? allowedFor : ["*"],
        expiresAt: expires,
        addedBy: req.user!.userUuid,
      });

      return res.status(201).json({ success: true, data: whitelist });
    } catch (error: any) {
      if (["INVALID_IP_RULE", "INVALID_IP_ADDRESS", "INVALID_IP_RANGE"].includes(error.message)) {
        return res.status(400).json({ success: false, error: error.message });
      }
      return res.status(500).json({ success: false, error: "ADD_FAILED" });
    }
  }
 
  // DELETE /api/v1/security/ip-whitelist/:uuid
  static async remove(req: Request, res: Response) {
    try {
      const tenantUuid = req.tenant?.uuid;
      if (!tenantUuid) {
        return res.status(400).json({ success: false, error: "TENANT_CONTEXT_REQUIRED" });
      }
      const uuid = String(req.params.uuid);

      const removed = await IPWhitelistService.removeIP({
        tenantUuid,
        whitelistUuid: uuid,
        removedBy: req.user!.userUuid,
      });
      if (!removed) {
        return res.status(404).json({ success: false, error: "RULE_NOT_FOUND" });
      }

      return res.status(200).json({ success: true, message: "IP removed" });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: "REMOVE_FAILED" });
    }
  }
 
  // POST /api/v1/security/ip-whitelist/check
  static async check(req: Request, res: Response) {
    try {
      // Verified tenant (requireTenantContext), not the login tenant on the token
      const tenantUuid = req.tenant?.uuid;
      if (!tenantUuid) {
        return res.status(400).json({ success: false, error: "TENANT_CONTEXT_REQUIRED" });
      }
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