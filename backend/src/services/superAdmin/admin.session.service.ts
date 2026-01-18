import prisma from "../config/prisma.ts"


export const viewActiveSessions= async (storeUuid: string)=>{
    return await prisma.session.findMany({
        where: {
            revoked: false,
            storeUuid
        },
        include: {
            user: {
                select: { phoneNumber: true, role: true },
            },
        },
    });
};

export const forceLogoutUsers= async(
    userUuid: string,
    storeUuid: string
)=>{
    await prisma.$transaction([
        prisma.session.updateMany({
            where: { userUuid, storeUuid },
            data: { revoked: true },
        }),
        prisma.refreshToken.updateMany({
            where: { userUuid },
            data: { revoked: true },
        }),
    ])
};
    
export const revokeSession= async (sessionUuid: string)=>{
    await prisma.session.update({
        where: {uuid: sessionUuid},
        data: {revoked: true}
    })
};
