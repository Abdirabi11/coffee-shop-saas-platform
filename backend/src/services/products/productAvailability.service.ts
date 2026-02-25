import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";

export class ProductAvailabilityService{
    static async add(input: {
        tenantUuid: string;
        storeUuid: string;
        productUuid: string;
        data: any;
    }) {
        const availability = await prisma.productAvailability.create({
            data: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                productUuid: input.productUuid,
                
                scheduleType: input.data.scheduleType || "RECURRING",
                dayOfWeek: input.data.dayOfWeek,
                startTime: input.data.startTime,
                endTime: input.data.endTime,
                
                specificDate: input.data.specificDate,
                allDay: input.data.allDay || false,
                
                isException: input.data.isException || false,
                priority: input.data.priority || 0,
                
                maxQuantity: input.data.maxQuantity,
                reason: input.data.reason,
                
                effectiveFrom: input.data.effectiveFrom,
                effectiveUntil: input.data.effectiveUntil,
                
                isActive: true,
            },
        });
      
        logWithContext("info", "[ProductAvailability] Schedule added", {
            availabilityUuid: availability.uuid,
            productUuid: input.productUuid,
        });
      
        return availability;
    }

    //List availability schedules
    static async list(input: {
        tenantUuid: string;
        storeUuid: string;
        productUuid: string;
    }){
        return prisma.productAvailability.findMany({
            where: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                productUuid: input.productUuid,
                isActive: true,
            },
            orderBy: [
                { priority: "desc" },
                { dayOfWeek: "asc" },
                { startTime: "asc" },
            ],
        });
    }
    
    //Update availability schedule
    static async update(input: {
        tenantUuid: string;
        uuid: string;
        data: any;
    }){
        return prisma.productAvailability.update({
            where: {
                uuid: input.uuid,
                tenantUuid: input.tenantUuid,
            },
            data: input.data,
        });
    }
    
    //Delete availability schedule
    static async delete(input: {
        tenantUuid: string;
        uuid: string;
    }){
        return prisma.productAvailability.update({
            where: {
                uuid: input.uuid,
                tenantUuid: input.tenantUuid,
            },
            data: { isActive: false },
        });
    }

    //Check if product is currently available
    //Handles: recurring schedules, specific dates, exceptions, priorities
    static async isProductAvailable(input: {
        tenantUuid: string;
        storeUuid: string;
        productUuid: string;
        now: Date;
    }): Promise<boolean> {
        const day = input.now.getDay(); // 0-6 (Sunday-Saturday)
        const time = input.now.toTimeString().slice(0, 5); // HH:MM
        const today = new Date(input.now);
        today.setHours(0, 0, 0, 0);
    
        // Get all active schedules for this product
        const schedules = await prisma.productAvailability.findMany({
            where: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                productUuid: input.productUuid,
                isActive: true,
                OR: [
                    // No effective dates (always active)
                    {
                        AND: [
                            { effectiveFrom: null },
                            { effectiveUntil: null },
                        ],
                    },
                    // Within effective date range
                    {
                        AND: [
                            { effectiveFrom: { lte: input.now } },
                            { effectiveUntil: { gte: input.now } },
                        ],
                    },
                    // Only effectiveFrom set
                    {
                        AND: [
                            { effectiveFrom: { lte: input.now } },
                            { effectiveUntil: null },
                        ],
                    },
                    // Only effectiveUntil set
                    {
                        AND: [
                            { effectiveFrom: null },
                            { effectiveUntil: { gte: input.now } },
                        ],
                    },
                ],
            },
            orderBy: { priority: "desc" },
        });
    
        if (schedules.length === 0) {
            // No schedules = always available
            return true;
        }
    
        // Check exceptions first (highest priority)
        const exceptions = schedules.filter(s => s.isException);
        
        for (const exception of exceptions) {
            if (exception.scheduleType === "SPECIFIC_DATE" && exception.specificDate) {
                const exceptionDate = new Date(exception.specificDate);
                exceptionDate.setHours(0, 0, 0, 0);
                
                if (today.getTime() === exceptionDate.getTime()) {
                    // Exception applies to today
                    if (exception.allDay) {
                        return false; // Closed all day
                    }
                    
                    if (exception.startTime && exception.endTime) {
                        if (time >= exception.startTime && time <= exception.endTime) {
                            return false; // Closed during this time
                        }
                    }
                }
            }
        };
    
        // Check regular schedules
        const regularSchedules = schedules.filter(s => !s.isException);
        
        for (const schedule of regularSchedules) {
          // Specific date
            if (schedule.scheduleType === "SPECIFIC_DATE" && schedule.specificDate) {
                const scheduleDate = new Date(schedule.specificDate);
                scheduleDate.setHours(0, 0, 0, 0);
                
                if (today.getTime() === scheduleDate.getTime()) {
                    if (schedule.allDay) {
                        return true;
                    }
                    
                    if (schedule.startTime && schedule.endTime) {
                        if (time >= schedule.startTime && time <= schedule.endTime) {
                            return true;
                        }
                    }
                }
            }
          
            // Recurring (day of week)
            if (schedule.scheduleType === "RECURRING" && schedule.dayOfWeek === day) {
                if (schedule.allDay) {
                    return true;
                }
                
                if (schedule.startTime && schedule.endTime) {
                    if (time >= schedule.startTime && time <= schedule.endTime) {
                        return true;
                    }
                }
            }
        };
    
        // No matching schedules = not available
        return false;
    }
}