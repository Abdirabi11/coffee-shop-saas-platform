import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { IdempotencyService } from "../../services/order/Idempotency.service.js";

//Clean up expired idempotency keys
//Runs daily at 4:00 AM
export class IdempotencyKeyCleanupJob{
    static async run(){
        logWithContext("info", "[IdempotencyKeyCleanup] Starting cleanup");

        try {
            await IdempotencyService.cleanup();
        
            logWithContext("info", "[IdempotencyKeyCleanup] Cleanup completed");
    
        } catch (error: any) {
            logWithContext("error", "[IdempotencyKeyCleanup] Job failed", {
                error: error.message,
            });
            throw error;
        }
    }
}