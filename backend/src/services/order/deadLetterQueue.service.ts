import prisma from "../../config/prisma.ts"

export class DeadLetterQueue {
    static async record(
      jobType: string,
      payload: any
    ) {
      await prisma.deadLetterJob.create({
        data: {
          jobType,
          payload,
          error: payload.reason ?? "Unknown error",
        },
      });
  
      console.error("[DLQ]", jobType, payload);
    }
};

export class DLQReplayJob {
    static async run(jobId: string) {
      const job = await prisma.deadLetterJob.findUnique({
        where: { id: jobId },
      });
  
      if (!job || job.resolved) return;
  
      // switch(job.jobType) → re-run
    }
};
  