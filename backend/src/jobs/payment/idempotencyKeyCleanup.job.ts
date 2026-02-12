import prisma from "../../config/prisma.ts"

export class IdempotencyKeyCleanupJob{
    static async run(){
        console.log("[IdempotencyKeyCleanup] Starting...");

        // Delete keys older than 7 days
        const result = await prisma.idempotencyKey.deleteMany({
            where: {
                expiresAt: { lt: new Date() },
            },
        });

        console.log(`[IdempotencyKeyCleanup] Deleted ${result.count} expired keys`);

    }
}