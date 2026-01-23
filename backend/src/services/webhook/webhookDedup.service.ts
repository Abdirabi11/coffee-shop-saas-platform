import prisma from "../../config/prisma.ts"


export class WebhookDedupService {
    static async hasProcessed(eventUuid: string){
        const existing= await prisma.webhookEvent.findUnique({
            where: {eventUuid}
        });
        return !!existing;
    }

    static async record(event: {
        provider: string;
        eventId: string;
        eventType: string;
        payload: any;
    }) {
        return prisma.webhookEvent.create({
            data: event,
        });
    }
}