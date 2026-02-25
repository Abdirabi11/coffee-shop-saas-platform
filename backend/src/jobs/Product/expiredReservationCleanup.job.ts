import prisma from "../../config/prisma.ts"
import { InventoryService } from "../../services/inventory/inventory.service.ts";

export class ExpiredReservationCleanupJob{
    static async run(){
        const expired= await prisma.inventoryReservation.findMany({
            where: {
                status: "ACTIVE",
                expiresAt: { lt: new Date() },
            },
        });
      
        for (const reservation of expired) {
            await InventoryService.releaseStock({
                orderUuid: reservation.orderUuid,
            });
        }
    }
}