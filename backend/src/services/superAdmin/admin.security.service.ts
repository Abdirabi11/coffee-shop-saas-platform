import prisma from "../config/prisma.ts"


export const getSecurityOverview= async (storeUuid: string)=>{
    const last24h= new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [ highSeverityFrauds, bannedUsers, activeAlerts,]= await Promise.all([
        prisma.fraudEvent.count({
            where: {
                storeUuid,
                severity: "HIGH",
                createdAt: { gte: last24h },
            }
        }),

        prisma.user.count({
            where: {
                banned: true,
                userStores: { some: { storeUuid } },
            }
        }),

        prisma.adminAlert.create({
            where: { resolved: false, storeUuid },
        }),
    ]);

    return { highSeverityFrauds, bannedUsers, activeAlerts };
};

export const getHighRiskUsers= async (storeUuid: string)=>{
    return prisma.user.findMany({
        where: {
            userStore: {some: {storeUuid}},
            fraudEvents: {
                some: { 
                    severity: "HIGH",
                    storeUuid
                }
            },
            select: {
                uuid: true,
                phoneNumber: true,
                banned: true,
                fraudEvents: {
                    where: { storeUuid },
                    orderBy: {createdAt: "desc"},
                    take: 5,
                    select: {
                        reason: true,
                        severity: true,
                        createdAt: true,
                    },
                },
                sessions: {
                    where: {
                        revoke: false,
                        storeUuid,
                    },
                    select: {
                        deviceType: true,
                        ipAddress: true,
                        lastUsedAt: true,
                    },
                },
            },
        },
    });
};

export const getSuspiciousSessions= async ()=>{
    return prisma.session.groupBy({
        by: ["userUuid"],
        _count: { uuid: true },
        having: {
            uuid: { _count: { gt: 3 } },
        },
    })
};

export const getSuspiciousIps = async () => {
    return prisma.fraudEvent.groupBy({
        by: ["ipAddress"],
        _count: { uuid: true },
        having: {
            uuid: { _count: { gt: 10 } },
        },
        orderBy: {
            _count: { uuid: "desc" },
        },
    });
};

export const getSessionDetailsForUsers= async(userUuids: string[])=>{
    return prisma.session.findMany({
        where: {userUuid: {in: userUuids}},
        orderBy: { createdAt: "desc" },
    })
};

export const getSecurityHeatmap= async (storeUuid: string)=>{
    return prisma.fraudEvent.groupBy({
        by: ["ipAddress"],
        _count: {uuid: true},
        where: {
            storeUuid,
            createdAt: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            }
        },
        orderBy: {
            _count: { uuid: "desc" },
        }
    })
};

export const getHourlyThreats= async (storeUuid: string)=>{
    return prisma.queryRaw`
        SELECT
            date_trunc('hour', "createdAt") as hour,
            count(*) as events
        FROM "FraudEvent"
        WHERE "storeUuid" = ${storeUuid}
        GROUP BY hour
        ORDER BY hour;
    `;
};