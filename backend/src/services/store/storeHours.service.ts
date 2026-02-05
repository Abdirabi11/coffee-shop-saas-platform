import prisma from "../../config/prisma.ts"

export class StoreHoursService{
    static async isStoreOpen(storeUuid: string): Promise<boolean> {
        const now = new Date();
        const dayOfWeek = now.getDay();

        const exception = await prisma.storeHourException.findFirst({
            where: {
              storeUuid,
              exceptionDate: {
                gte: new Date(now.setHours(0, 0, 0, 0)),
                lt: new Date(now.setHours(23, 59, 59, 999)),
              },
              isActive: true,
            },
        });

        if (exception) {
            if (exception.isClosed) return false;
            // Check custom hours
            // Implementation depends on customHours JSON structure
        };

        const hours = await prisma.storeOpeningHour.findFirst({
            where: {
              storeUuid,
              dayOfWeek: this.mapDayOfWeek(dayOfWeek),
              isActive: true,
              scheduleType: "REGULAR",
            },
        });
      
        if (!hours || hours.isClosed) return false;
        if (hours.is24Hours) return true;
      
        const currentTime = now.toTimeString().slice(0, 5); // "HH:mm"
        return currentTime >= hours.openTime && currentTime <= hours.closeTime;
    }

    private static mapDayOfWeek(day: number): string {
        const days = [
          "SUNDAY",
          "MONDAY",
          "TUESDAY",
          "WEDNESDAY",
          "THURSDAY",
          "FRIDAY",
          "SATURDAY",
        ];
        return days[day];
    }
};