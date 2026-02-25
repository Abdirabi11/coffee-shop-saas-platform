import prisma from "../../config/prisma.ts"

export class CategoryAvailabilityService {
    
    //Add availability rule
    static async add(input: {
        categoryUuid: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
    }) {
        // Validate time format
        this.validateTimeFormat(input.startTime);
        this.validateTimeFormat(input.endTime);

        return prisma.categoryAvailability.create({
            data: {
                categoryUuid: input.categoryUuid,
                dayOfWeek: input.dayOfWeek,
                startTime: input.startTime,
                endTime: input.endTime,
                isActive: true,
            },
        });
    }

    //List availability rules
    static async list(categoryUuid: string) {
        return prisma.categoryAvailability.findMany({
            where: {
                categoryUuid,
                isActive: true,
            },
            orderBy: [
                { dayOfWeek: "asc" },
                { startTime: "asc" },
            ],
        });
    }

    //Update availability rule
    static async update(input: {
        uuid: string;
        data: {
            dayOfWeek?: number;
            startTime?: string;
            endTime?: string;
            isActive?: boolean;
        };
    }) {
        // Validate times if provided
        if (input.data.startTime) {
            this.validateTimeFormat(input.data.startTime);
        }
        if (input.data.endTime) {
            this.validateTimeFormat(input.data.endTime);
        }

        return prisma.categoryAvailability.update({
            where: { uuid: input.uuid },
            data: input.data,
        });
    }

   //Delete availability rule
    static async delete(uuid: string) {
        return prisma.categoryAvailability.update({
            where: { uuid },
            data: { isActive: false },
        });
    }

   //Check if category is available now
    static async isCategoryAvailable(
        categoryUuid: string,
        now: Date = new Date()
    ): Promise<boolean> {
        const dayOfWeek = now.getDay(); // 0-6
        const currentTime = this.formatTime(now); // "HH:MM"

        const rule = await prisma.categoryAvailability.findFirst({
            where: {
                categoryUuid,
                dayOfWeek,
                startTime: { lte: currentTime },
                endTime: { gte: currentTime },
                isActive: true,
            },
        });

        return !!rule;
    }

   //Format time as HH:MM
    private static formatTime(date: Date): string {
        const hours = date.getHours().toString().padStart(2, "0");
        const minutes = date.getMinutes().toString().padStart(2, "0");
        return `${hours}:${minutes}`;
    }

    //Validate time format (HH:MM)
    private static validateTimeFormat(time: string) {
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (!timeRegex.test(time)) {
            throw new Error(`Invalid time format: ${time}. Expected HH:MM`);
        }
    }
}