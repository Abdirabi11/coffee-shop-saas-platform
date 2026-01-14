import { invalidateMenu } from "../../cache/menu.invalidate.ts";
import prisma from "../../config/prisma.ts"
import { MenuPrewarmService } from "../menu/menu-prewarm.service.ts";

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