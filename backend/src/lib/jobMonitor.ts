

export async function trackJobExecution(
    jobName: string,
    execution: () => Promise<void>
  ) {
    const startTime = Date.now();
    let status: "SUCCESS" | "FAILED" = "SUCCESS";
    let error: string | undefined;
  
    try {
      await execution();
    } catch (err: any) {
      status = "FAILED";
      error = err.message;
      throw err;
    } finally {
      const duration = Date.now() - startTime;
  
      // Update heartbeat
      await prisma.jobHeartbeat.upsert({
        where: { jobName },
        update: {
          lastRunAt: new Date(),
          status: status === "SUCCESS" ? "COMPLETED" : "FAILED",
          lastDuration: duration,
          totalRuns: { increment: 1 },
          successCount: status === "SUCCESS" ? { increment: 1 } : undefined,
          failureCount: status === "FAILED" ? { increment: 1 } : undefined,
          consecutiveFailures: status === "FAILED" ? { increment: 1 } : 0,
          lastError: error,
        },
        create: {
          jobName,
          jobType: "CRON",
          lastRunAt: new Date(),
          status: status === "SUCCESS" ? "COMPLETED" : "FAILED",
          lastDuration: duration,
          totalRuns: 1,
          successCount: status === "SUCCESS" ? 1 : 0,
          failureCount: status === "FAILED" ? 1 : 0,
          lastError: error,
        },
      });
    }
};
  