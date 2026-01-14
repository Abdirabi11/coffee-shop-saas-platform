import prisma from "../../config/prisma.ts"

export class CategoryAvailabilityService {
    static async add(categoryUuid: string, data: any){
        return prisma.categoryAvailability.creare({
            data: {
                categoryUuid,
                dayOfWeek: data.dayOfWeek,
                startTime: data.startTime,
                endTime: data.endTime,
            }
        })
    };

    static async list(uuid: string, data: any){
        return prisma.categoryAvailability.findFirst({
            where: { uuid },
            data: {isActive: true}
        })
    };

    static async isCategoryAvailable(categoryUuid: string, now: Date){
        const day= now.getDay();
        const time= now.toISOString().slice(0, 5);

        const rule= await prisma.categoryAvailability.findFirst({
            where: {
                categoryUuid,
                dayOfWeek: day,
                startTime: { lte: time },
                endTime: { gte: time },
                isActive: true,
            }
        });
        return Boolean(rule);
    }
};