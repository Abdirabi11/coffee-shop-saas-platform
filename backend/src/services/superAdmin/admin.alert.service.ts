import prisma from "../config/prisma.ts"


export const getAdminAlerts = async (storeUuid: string) => {
    return prisma.adminAlert.findMany({
      where: { 
        storeUuid,
        resolved: false 
      },
      orderBy: { createdAt: "desc" },
    });
};

export const resolveAdminAlert = async (
  alertId: string,
  storeUuid: string
  ) => {
    return prisma.adminAlert.update({
      where: { uuid: alertId, storeUuid },
      data: { resolved: true },
    });
};