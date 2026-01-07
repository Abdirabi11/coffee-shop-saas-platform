import prisma from "../config/prisma.ts"
import type { Request, Response, NextFunction } from "express";

export const createUserSession = async (
  userUuid: string,
  refreshTokenUuid: string,
  req: Request
) => {
  return prisma.session.create({
    data: {
      userUuid,
      refreshTokenUuid,
      deviceType: req.headers["x-device-type"] as string,
      deviceId: req.headers["x-device-id"] as string,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    },
  });
}; 

export const revokeAllSessions = async (
  userUuid: string,
  storeUuid: string
) => {
  await prisma.refreshToken.updateMany({
    where: { userUuid, session: { storeUuid } },
    data: { revoked: true },
  });

  await prisma.session.updateMany({
    where: { userUuid, storeUuid },
    data: { revoked: true },
  });
};

export const listSessions = async (
  userUuid: string,
  storeUuid: string
) => {
  return prisma.session.findMany({
    where: { userUuid, storeUuid, revoked: false },
    include: { refreshToken: true },
    orderBy: { lastUsedAt: "desc" },
  });
};

export const logoutByRefreshToken = async (refreshToken: string) => {
  await prisma.refreshToken.updateMany({
    where: { token: refreshToken },
    data: { revoked: true },
  });

  await prisma.session.updateMany({
    where: { refreshToken: { token: refreshToken } },
    data: { revoked: true },
  });
};
