import { Request, Response } from "express";
import { DeviceTrustService } from "../../services/security/DeviceTrust.service.ts";


export class DeviceTrustController {
  // GET /api/v1/security/devices
  static async listDevices(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      const devices = await DeviceTrustService.listTrustedDevices(user.uuid);
 
      return res.status(200).json({
        success: true,
        data: devices.map((d) => ({
          uuid: d.uuid,
          deviceName: d.deviceName,
          deviceType: d.deviceType,
          deviceOS: d.deviceOS,
          deviceBrowser: d.deviceBrowser,
          trusted: d.trusted,
          lastSeenAt: d.lastSeenAt,
          loginCount: d.loginCount,
          createdAt: d.createdAt,
        })),
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: "FETCH_FAILED" });
    }
  }
 
  // POST /api/v1/security/devices/:deviceUuid/revoke
  static async revokeDevice(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      const { deviceUuid } = req.params;
 
      await DeviceTrustService.revokeDeviceTrust({
        userUuid: user.uuid,
        deviceUuid,
        revokedBy: user.uuid,
      });
 
      return res.status(200).json({ success: true, message: "Device trust revoked" });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: "REVOKE_FAILED" });
    }
  }
 
  // GET /api/v1/security/devices/status
  static async getDeviceStatus(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      const fingerprint =
        (req.headers["x-fingerprint"] as string) ||
        (req.headers["x-device-fingerprint"] as string);
 
      if (!fingerprint) {
        return res.status(200).json({
          success: true,
          data: { trusted: false, reason: "No fingerprint provided" },
        });
      }
 
      const status = await DeviceTrustService.getDeviceTrustStatus({
        userUuid: user.uuid,
        deviceFingerprint: fingerprint,
      });
 
      return res.status(200).json({ success: true, data: status });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: "FETCH_FAILED" });
    }
  }
}
