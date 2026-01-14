import type { Request, Response } from "express";
import * as adminSecurityService from "../services/admin.security.service.ts";
import * as auditLogService from "../services/auditLog.service.ts";


export const getSecurityOverviewController = async ( _req: Request, res: Response )=> {
  const data = await adminSecurityService.getSecurityOverview();
  res.json(data);
};

export const getHighRiskUsersController = async ( _req: Request, res: Response) => {
  const users = await adminSecurityService.getHighRiskUsers();
  res.json({ users });
};

export const getSuspiciousIpsController = async ( _req: Request, res: Response) => {
  const ips = await adminSecurityService.getSuspiciousIps();
  res.json({ ips });
};

export const getSessionDetailsController = async (req: Request, res: Response) => {
  const { userUuids } = req.query;

  if (!userUuids || !Array.isArray(userUuids)) {
    return res.status(400).json({ message: "userUuids[] required" });
  }

  const sessions = await adminSecurityService.getSessionDetailsForUsers(
    userUuids as string[]
  );

  res.json({ sessions });
};

export const getAuditLogsController = async ( req: Request, res: Response) => {
  const logs = await auditLogService.getAuditLogs(req.query);
  res.json({ logs });
};

export const getSecurityHeatmapController = async(req: Request, res: Response)=>{
  const storeUuid= req.user!.storeUuid;

  const heatmap= await adminSecurityService.getSecurityHeatmap(storeUuid);
  res.json({ heatmap });
};

export const getHourlyThreatsController = async (req: Request, res: Response) => {
  const storeUuid = req.user!.storeUuid;

  const threats = await adminSecurityService.getHourlyThreats(storeUuid);
  res.json({ threats });
};


