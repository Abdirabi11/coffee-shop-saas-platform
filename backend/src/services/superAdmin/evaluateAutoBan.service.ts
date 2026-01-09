import prisma from "../config/prisma.ts"

export const evaluateAutoBan= async (
    userUuid: string,
    storeUuid: string
)=>{
    const events= await prisma.fraudEvent({
        where: {
            userUuid,
            storeUuid
        },
        orderBy: { createdAt: "desc"},
        take: 20
    });

    const score = events.reduce((acc, e) => {
        if (e.severity === "LOW") return acc + 1;
        if (e.severity === "MEDIUM") return acc + 3;
        if (e.severity === "HIGH") return acc + 6;
        if (e.severity === "CRITICAL") return acc + 10;
        return acc;
    }, 0);

    if(score >= 20){
        await prisma.userStoreBlock.upsert({
            where: {
                userUuid_storeUuid: { userUuid, storeUuid },
            },
            update: {
                blockedAt: new Date(),
                reason: "Automatic fraud protection",
            },
            create: {
                userUuid,
                storeUuid,
                blockedAt: new Date(),
                reason: "Automatic fraud protection",
            },
        })
        return { banned: true, score };
    };
    return { banned: false, score };
}