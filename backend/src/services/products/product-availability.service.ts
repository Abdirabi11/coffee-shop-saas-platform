import prisma from "../../config/prisma.ts"

export class ProductAvailabilityService{
    static async add(productUuid: string, data: string){
        return prisma.productAvailability.create({
            data: {
                productUuid,
                dayOfWeek: data.dayOfWeek,
                startTime: data.startTime,
                endTime: data.endTime,
            }
        })
    };

    static async list(productUuid: string){
        return prisma.productAvailability.findMany({
            where: {
              productUuid,
              isActive: true,
            },
            orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
        });
    };

    static async update(uuid: string, data: any){
        return prisma.productAvailability.update({
            where: { uuid },
            data,
        });
    };

    static async(uuid: string){
        return prisma.productAvailability.update({
            where: { uuid },
            data: { isActive: false },
        });
    };

    // 🔥 Core logic used by menu API
    static async isProductAvailable(productUuid: string, now: Date){
        const day = now.getDay();
        const time = now.toTimeString().slice(0, 5); 

        const match = await prisma.productAvailability.findFirst({
            where: {
              productUuid,
              dayOfWeek: day,
              startTime: { lte: time },
              endTime: { gte: time },
              isActive: true,
            },
        });
        return Boolean(match);
    };
};