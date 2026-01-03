import prisma from "../../config/prisma.ts"

export const isTrustedDevice = async (
    userUuid: string,
    fingerprintHash?: string
  ): Promise<boolean> => {
    if (!fingerprintHash) return false;

    const knownDevice= await prisma.session.findFirst({
        where: {
            userUuid,
            fingerprintHash,
            revoked: false,
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days
            },
        }
    });
    return Boolean(knownDevice);
}