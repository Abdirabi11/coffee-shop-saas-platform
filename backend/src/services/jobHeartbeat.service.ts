import prisma from "../config/prisma.ts"

export class JobHeartbeatService {
    static async beat(jobName: string, status = "OK") {
      await prisma.jobHeartbeat.upsert({
        where: { jobName },
        update: {
          lastRunAt: new Date(),
          status,
        },
        create: {
          jobName,
          lastRunAt: new Date(),
          status,
        },
      });
    }
};