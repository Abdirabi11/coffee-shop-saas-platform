import prisma from "../../config/prisma.ts"

export class CategoryVisibilityService {
  
    //Check if category is visible now
    static async isCategoryVisible(
        categoryUuid: string,
        now: Date = new Date()
    ): Promise<boolean> {
        const schedules = await prisma.categoryVisibilitySchedule.findMany({
            where: { categoryUuid },
        });
  
        // If no schedules, category is always visible
        if (schedules.length === 0) return true;
    
        const currentDay = now.getDay();
        const currentTime = this.formatTime(now);
  
        // Check if any schedule matches
        return schedules.some((schedule) => {
            // Check day of week (if specified)
            if (schedule.dayOfWeek !== null && schedule.dayOfWeek !== currentDay) {
                return false;
            }
    
            // Check time range
            return (
                currentTime >= schedule.startTime &&
                currentTime <= schedule.endTime
            );
        });
    }
  
    //Format time as HH:MM
    private static formatTime(date: Date): string {
        const hours = date.getHours().toString().padStart(2, "0");
        const minutes = date.getMinutes().toString().padStart(2, "0");
        return `${hours}:${minutes}`;
    }
}
  