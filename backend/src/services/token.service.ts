import prisma from "../utils/prisma.ts";
import { verifyRefreshToken, signAccessToken, signRefreshToken } from "./token.service.ts";
import { createUserSession } from "./session.service.ts";

export const rotateRefreshTokenService = async (token: string, req: any) => {
    const decoded = verifyRefreshToken(token) as { userUuid: string };
  
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });
  
    if (!storedToken || storedToken.revoked) {
      throw new Error("Invalid refresh token");
    }
  
    await prisma.refreshToken.update({
      where: { uuid: storedToken.uuid },
      data: { revoked: true },
    });
  
    await prisma.session.updateMany({
      where: { refreshTokenUuid: storedToken.uuid },
      data: { revoked: true },
    });
  
    const newAccessToken = signAccessToken({
      userUuid: storedToken.user.uuid,
      role: storedToken.user.role,
    });
  
    const newRefreshToken = signRefreshToken({
      userUuid: storedToken.user.uuid,
    });
  
    const newStored = await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userUuid: storedToken.user.uuid,
      },
    });
  
    await createUserSession(
      storedToken.user.uuid,
      newStored.uuid,
      req
    );
  
    return { newAccessToken, newRefreshToken };
};