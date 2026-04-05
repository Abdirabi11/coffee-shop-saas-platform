import { invalidateMenu } from "../../cache/menu.invalidate.ts";
import prisma from "../../config/prisma.ts"
import { MenuPrewarmService } from "../menu/menu-prewarm.service.ts";

// interface StoreHoursService {
//     isStoreOpen(storeUuid: string, time: DateTime): Promise<boolean>;
//     getNextOpenTime(storeUuid: string): Promise<DateTime>;
//     getNextCloseTime(storeUuid: string): Promise<DateTime>;
//     getHoursForDate(storeUuid: string, date: DateTime): Promise<StoreHours>;
//     applyException(storeUuid: string, exception: HourException): Promise<void>;
//   }
  
//   // 2. Availability Calculator
//   interface AvailabilityCalculator {
//     isProductAvailable(productUuid: string, time: DateTime): Promise<boolean>;
//     isCategoryAvailable(categoryUuid: string, time: DateTime): Promise<boolean>;
//     getAvailableProducts(storeUuid: string, time: DateTime): Promise<Product[]>;
//     getUnavailabilityReason(entityUuid: string): Promise<string>;
//   }
  
//   // 3. Capacity Manager
//   interface CapacityManager {
//     checkCapacity(storeUuid: string, orderType: OrderType): Promise<boolean>;
//     reserveCapacity(storeUuid: string, orderType: OrderType): Promise<void>;
//     releaseCapacity(storeUuid: string, orderType: OrderType): Promise<void>;
//     getCurrentCapacity(storeUuid: string): Promise<CapacityStatus>;
//   }
  
//   // 4. Schedule Validator
//   interface ScheduleValidator {
//     validateTimeRange(start: string, end: string): ValidationResult;
//     detectConflicts(schedule: Schedule[]): Conflict[];
//     resolvePriority(schedules: Schedule[]): Schedule;
//   }
export class StoreOpeningService{
    static async set(storeUuid: string, data: any){
        const opening= await prisma.storeOpeningHour.upsert({
            where: {
                storeUuid_dayOfWeek: {
                  storeUuid,
                  dayOfWeek: data.dayOfWeek,
                },
            },
            update: {
                openTime: data.openTime,
                closeTime: data.closeTime,
                isClosed: data.isClosed ?? false,
            },
            create: {
                storeUuid,
                dayOfWeek: data.dayOfWeek,
                openTime: data.openTime,
                closeTime: data.closeTime,
                isClosed: data.isClosed ?? false,
            }
        });
        await invalidateMenu(storeUuid, "STORE_OPEN");
        return opening;
    };

    static async list(storeUuid: string){
        return prisma.storeOpeningHour.findMany({
            where: { storeUuid },
            orderBy: { dayOfWeek: "asc" },
        })
    };

    static async isStoreOpen(storeUuid: string, now: Date){
        const day= now.getDay()
        const time = now.toTimeString().slice(0, 5);

        const rule= await prisma.storeOpeningHour.findFirst({
            where: { storeUuid, dayOfWeek: day },
        });

        if (!rule || rule.isClosed) return false;

        return rule.openTime <= time && rule.closeTime >= time;
    };

    static async onStoreOpened(storeUuid: string) {
        await MenuPrewarmService.prewarmStoreMenu(storeUuid);
    };
}