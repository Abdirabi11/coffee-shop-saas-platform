import prisma from "../config/prisma.ts"
import { AlertService } from "./alert.service.tss";

export class StuckJobDetectorJob {
    static async run() {
      const threshold = new Date(Date.now() - 5 * 60 * 1000);
  
      const stuckJobs = await prisma.jobHeartbeat.findMany({
        where: {
          lastRunAt: { lt: threshold },
        },
      });
  
      for (const job of stuckJobs) {
        AlertService.ops(
          "Job heartbeat missing",
          {
            jobName: job.jobName,
            lastRunAt: job.lastRunAt,
          },
          { level: "CRITICAL" }
        );
      }
    }
};