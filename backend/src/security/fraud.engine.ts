import prisma from "../config/prisma.ts"

export const evaluateAutoBan= async (userUuid: String, storeUuid?: String)=>{
    const events= await prisma.fraudEvent.findMany({
        where: {userUuid, storeUuid},
        orderBy: {createdAt: "desc"},
        take: 20
    });
    
    const score = events.reduce((acc, e) => {
        if (e.severity === "LOW") return acc + 1;
        if (e.severity === "MEDIUM") return acc + 3;
        if (e.severity === "HIGH") return acc + 6;
        if (e.severity === "CRITICAL") return acc + 10;
        return acc;
    }, 0);

    if(score >=20 ){
        await prisma.user.update({
            where: {uuid: userUuid},
            data: {
                isBanned: true,
                bannedAt: new Date(),
                banReason: "Automatic ban due to repeated suspicious activity",
            },
        })
        return { banned: true, score };
    };
    return { banned: false, score };
}