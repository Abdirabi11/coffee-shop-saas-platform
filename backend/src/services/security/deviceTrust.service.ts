import prisma from "../../config/prisma.js"
import { logWithContext } from "../../infrastructure/observability/logger.js";
import { MetricsService } from "../../infrastructure/observability/metricsService.js";

//Check if device is trusted
export class DeviceTrustService {

  static async isTrustedDevice(
    userUuid: string,
    deviceFingerprint?: string
  ): Promise<boolean> {

    if (!deviceFingerprint) return false;

    try {
      const trustedDevice = await prisma.trustedDevice.findFirst({
        where: {
          userUuid,
          deviceFingerprint,
          trusted: true,
          isActive: true,
          lastSeenAt: {
            gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days
          },
        },
      });

      return !!trustedDevice;

    } catch (error: any) {
      logWithContext("error", "[DeviceTrust] Failed to check device trust", {
        error: error.message,
        userUuid,
      });

      return false;
    }
  }

  //Trust a device
  static async trustDevice(input: {
    userUuid: string;
    deviceFingerprint: string;
    deviceId: string;
    ipAddress: string;
    req: Request;
  }) {
    try {
      // Extract device info
      const userAgent = input.req.headers["user-agent"] || "";
      const deviceType = this.extractDeviceType(userAgent);
      const deviceOS = this.extractOS(userAgent);
      const deviceBrowser = this.extractBrowser(userAgent);
      const deviceName = input.req.headers["x-device-name"] as string;

      // Check if device already exists
      const existing = await prisma.trustedDevice.findUnique({
        where: {
          userUuid_deviceFingerprint: {
            userUuid: input.userUuid,
            deviceFingerprint: input.deviceFingerprint,
          },
        },
      });

      if (existing) {
        // Update last seen
        await prisma.trustedDevice.update({
          where: { uuid: existing.uuid },
          data: {
            lastSeenAt: new Date(),
            loginCount: { increment: 1 },
            trusted: true,
            trustedAt: existing.trusted ? existing.trustedAt : new Date(),
          },
        });

        return existing;
      }

      // Create new trusted device
      const device = await prisma.trustedDevice.create({
        data: {
          userUuid: input.userUuid,
          deviceFingerprint: input.deviceFingerprint,
          deviceId: input.deviceId,
          deviceName,
          deviceType,
          deviceOS,
          deviceBrowser,
          ipAddress: input.ipAddress,
          trusted: true,
          trustedAt: new Date(),
          loginCount: 1,
        },
      });

      logWithContext("info", "[DeviceTrust] Device trusted", {
        userUuid: input.userUuid,
        deviceUuid: device.uuid,
      });

      MetricsService.increment("device.trusted", 1);

      return device;

    } catch (error: any) {
      logWithContext("error", "[DeviceTrust] Failed to trust device", {
        error: error.message,
        userUuid: input.userUuid,
      });

      throw error;
    }
  }

  static async revokeDeviceTrust(input: {
    userUuid: string;
    deviceUuid: string;
    revokedBy: string;
  }) {
    try {
      await prisma.trustedDevice.update({
        where: {
          uuid: input.deviceUuid,
          userUuid: input.userUuid,
        },
        data: {
          trusted: false,
          trustRevokedAt: new Date(),
          trustRevokedBy: input.revokedBy,
          isActive: false,
        },
      });

      // Revoke all sessions from this device
      await prisma.session.updateMany({
        where: {
          userUuid: input.userUuid,
          deviceFingerprint: (
            await prisma.trustedDevice.findUnique({
              where: { uuid: input.deviceUuid },
              select: { deviceFingerprint: true },
            })
          )?.deviceFingerprint,
          status: "ACTIVE",
        },
        data: {
          status: "REVOKED",
          revoked: true,
          revokedAt: new Date(),
          revokedBy: input.revokedBy,
          revokedReason: "Device trust revoked",
        },
      });

      logWithContext("info", "[DeviceTrust] Device trust revoked", {
        userUuid: input.userUuid,
        deviceUuid: input.deviceUuid,
      });

      MetricsService.increment("device.trust_revoked", 1);

    } catch (error: any) {
      logWithContext("error", "[DeviceTrust] Failed to revoke device trust", {
        error: error.message,
      });

      throw error;
    }
  }

  //List user's trusted devices
  static async listTrustedDevices(userUuid: string) {
    return prisma.trustedDevice.findMany({
      where: {
        userUuid,
        isActive: true,
      },
      orderBy: { lastSeenAt: "desc" },
    });
  }

  //Get device trust status
  static async getDeviceTrustStatus(input: {
    userUuid: string;
    deviceFingerprint: string;
  }) {
    const device = await prisma.trustedDevice.findUnique({
      where: {
        userUuid_deviceFingerprint: {
          userUuid: input.userUuid,
          deviceFingerprint: input.deviceFingerprint,
        },
      },
    });

    if (!device) {
      return {
        trusted: false,
        firstSeen: false,
      };
    }

    return {
      trusted: device.trusted && device.isActive,
      firstSeen: true,
      lastSeen: device.lastSeenAt,
      loginCount: device.loginCount,
    };
  }

  //Extract device type from user agent
  private static extractDeviceType(userAgent: string): string {
    if (/mobile/i.test(userAgent)) return "MOBILE";
    if (/tablet/i.test(userAgent)) return "TABLET";
    if (/desktop|windows|mac/i.test(userAgent)) return "DESKTOP";
    return "UNKNOWN";
  }

  //Extract OS from user agent
  private static extractOS(userAgent: string): string {
    if (/windows/i.test(userAgent)) return "Windows";
    if (/mac os/i.test(userAgent)) return "macOS";
    if (/android/i.test(userAgent)) return "Android";
    if (/ios|iphone|ipad/i.test(userAgent)) return "iOS";
    if (/linux/i.test(userAgent)) return "Linux";
    return "Unknown";
  }


  //Extract browser from user agent
  private static extractBrowser(userAgent: string): string {
    if (/chrome/i.test(userAgent)) return "Chrome";
    if (/firefox/i.test(userAgent)) return "Firefox";
    if (/safari/i.test(userAgent)) return "Safari";
    if (/edge/i.test(userAgent)) return "Edge";
    return "Unknown";
  }

  //Clean up old untrusted devices
  static async cleanupOldDevices() {
    const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000); // 180 days

    const result = await prisma.trustedDevice.deleteMany({
      where: {
        lastSeenAt: { lt: cutoff },
        trusted: false,
      },
    });

    logWithContext("info", "[DeviceTrust] Cleaned up old devices", {
      count: result.count,
    });

    return result.count;
  }
}