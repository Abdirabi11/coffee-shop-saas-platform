import prisma from "../../config/prisma.ts"

export const revokeUserSessions = async (
    userUuid: string,
    storeUuid: string
  ) => {
    await prisma.session.updateMany({
      where: {
        userUuid,
        storeUuid,
        revoked: false,
      },
      data: { revoked: true },
    });
  
    await prisma.refreshToken.updateMany({
      where: {
        userUuid,
        revoked: false,
      },
      data: { revoked: true },
    });
};