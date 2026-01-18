import prisma from "../../config/prisma.ts"

export class StaleOrderMetricsJob{
    static async runDaily(){
        const staleOrders= await prisma.order.groupBy({
            by: ["storeUuid"],
            where: {
                status: "PREPARING"
            },
            _count: { uuid: true },
        });

        for (const stat of staleOrders){
            await prisma.storeOpsMetrics.upsert({
                where: {
                    storeUuid: stat.storeUuid,
                },
                update: {
                    stalePreparingOrders: stat._count.uuid,
                },
                create: {
                    storeUuid: stat.storeUuid,
                    stalePreparingOrders: stat._count.uuid,
                },
            })
        };
    }
}