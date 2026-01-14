import { schedule } from "node-cron";
import prisma from "../../config/prisma.ts"

export class CategoryVisibilityService {
   
    static async isCategoryVisible(
        categoryUuid: string,
        now: Date = new Date()
      ): Promise<boolean> {
        const schedules= await prisma.categoryVisibilitySchedule.findMany({
            where: { categoryUuid}
        });

        if (schedules.length === 0) return true;

        const currentDay = now.getDay(); 
        const currentTime = now.toTimeString().slice(0, 5);

        return schedule.some((schedule)=>{
            if (schedule.dayOfWeek !== null && schedule.dayOfWeek !== currentDay) {
                return false;
            };

            return (
                currentTime >= schedule.startTime &&
                currentTime <= schedule.endTime
            );
        })
    }
    
}