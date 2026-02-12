import prisma from "../../config/prisma.ts"


export class OrphanedPaymentDetectionJob{
    static async run(){
        console.log("[OrphanedPaymentDetection] Starting...");

        // Find payments without orders
        const orphanedPayments = await prisma.payment.findMany({
            where: {
                order: null,
                createdAt: {
                lt: new Date(Date.now() - 24 * 60 * 60 * 1000),
                },
            },
            take: 100,
        });

        if (orphanedPayments.length > 0) {
        // Create critical alert
            await prisma.adminAlert.create({
                data: {
                tenantUuid: "SYSTEM",
                alertType: "ORPHANED_PAYMENTS_DETECTED",
                category: "FINANCIAL",
                level: "CRITICAL",
                priority: "HIGH",
                title: `${orphanedPayments.length} Orphaned Payments Detected`,
                message: "Payments exist without corresponding orders - requires manual investigation",
                context: {
                    paymentUuids: orphanedPayments.map(p => p.uuid),
                    count: orphanedPayments.length,
                },
                },
            });
        };
        console.log(`[OrphanedPaymentDetection] Found ${orphanedPayments.length} orphaned payments`);
    }
}