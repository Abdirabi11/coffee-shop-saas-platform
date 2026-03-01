import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";
import { DeviceTrustService } from "../../services/security/deviceTrust.service.ts";

export class DeviceCleanupJob {
    /**
     * Clean up old untrusted devices
     * Run daily at 3:00 AM
     */
    static async run() {
      const startTime = Date.now();
      
        logWithContext("info", "[DeviceCleanup] Starting cleanup");
  
        try {
            const count = await DeviceTrustService.cleanupOldDevices();
    
            const duration = Date.now() - startTime;
    
            logWithContext("info", "[DeviceCleanup] Cleanup completed", {
            deletedDevices: count,
            durationMs: duration,
            });
    
            MetricsService.increment("device.cleanup.deleted", count);
            MetricsService.timing("device.cleanup.duration", duration);
    
            return { deletedDevices: count };
    
        } catch (error: any) {
            logWithContext("error", "[DeviceCleanup] Cleanup failed", {
                error: error.message,
            });
    
            MetricsService.increment("device.cleanup.error", 1);
    
            throw error;
        }
    }
}