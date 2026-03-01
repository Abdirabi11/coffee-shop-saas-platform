import prisma from "../config/prisma.ts"

export class AlertService{
    static async ops(
        title: string,
        context?: Record<string, any>,
        options?: {
            storeUuid?: string;
            level?: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
            message?: string;
       }
    ){
        await prisma.adminAlert.create({
            data: {
              storeUuid: options?.storeUuid,
              level: options?.level ?? "ERROR",
              title,
              message: options?.message,
              context,
            },
        });

        console.error("[ALERT]", {
            title,
            level: options?.level ?? "ERROR",
            context,
        });
    }

    static async getUnresolved(storeUuid: string) {
        return prisma.adminAlert.findMany({
          where: { storeUuid, resolved: false },
          orderBy: { createdAt: "desc" },
        });
    }
    
    static async resolve(alertUuid: string, storeUuid?: string) {
        return prisma.adminAlert.update({
            where: { uuid: alertUuid },
            data: { resolved: true },
        });
    }
}