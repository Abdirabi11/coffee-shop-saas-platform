import prisma from "../config/prisma.ts"

interface AuditLogInput {
  actorUuid: string;
  action: string;
  targetType: string;
  targetUuid?: string;
  ipAddress: string;
  userAgent: string;
}

export const logAudit = async ({
    actorUuid,
    storeUuid,
    action,
    targetType,
    targetUuid,
    req,
  }: {
    actorUuid: string;
    storeUuid: string;
    action: string;
    targetType: string;
    targetUuid?: string;
    req: Request;
  }) => {
    await prisma.auditLog.create({
      data: {
        actorUuid,
        storeUuid,
        action,
        targetType,
        targetUuid,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "UNKNOWN",
      },
    });
  };

export const createAudit= async ({
  actorUuid,
  action,
  targetType,
  targetUuid,
  ipAddress,
  userAgent,
}: AuditLogInput)=>{
  return prisma.auditLog.create({
    data: {
      actorUuid,
      action,
      targetType,
      targetUuid,
      ipAddress,
      userAgent,
      storeUuid: "SYSTEM",
    }
  })
}
  