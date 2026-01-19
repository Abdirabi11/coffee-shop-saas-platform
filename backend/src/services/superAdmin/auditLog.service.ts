import prisma from "../../config/prisma.ts";


export const getAuditLogs = async (query: any, storeUuid: string,) => {
    const {action, actorUuid, from, to } = query;

    await prisma.auditLog.findMany({
        where:{
            storeUuid,
            action: action || undefined,
            actorUuid: actorUuid || undefined,
            createdAt: {
              gte: from ? new Date(from) : undefined,
              lte: to ? new Date(to) : undefined,
            },
        },
        orderBy: { createdAt: "desc"},
        include: {
            actor: {
                select: { name: true, role: true },
            }
        }
    })
};

export class AuditLogService{
    static async record({
        storeUuid,
        action,
        entityUuid,
        actorUuid,
        metadata,
    }: {
        storeUuid?: string;
        action: string;
        entityUuid: string;
        actorUuid?: string;
        metadata?: any;
    }){
        await prisma.auditLog.create({
            data: {
                storeUuid,
                action,
                entityUuid,
                actorUuid,
                metadata,
            },
        })
    }
};