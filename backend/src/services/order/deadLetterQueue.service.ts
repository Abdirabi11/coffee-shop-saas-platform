import prisma from "../../config/prisma.jts"
import { OrderCommandService } from "./order-command.service.ts";

export class DeadLetterQueue {
  static async record(
    tenantUuid: string,
    jobType: string,
    payload: any,
    error: string
  ) {
    await prisma.deadLetterJob.create({
      data: {
        tenantUuid,
        jobType,
        queueName: "orders",
        payload,
        error,
        errorType: this.categorizeError(error),
        payloadSize: JSON.stringify(payload).length,
      },
    });

    console.error("[DLQ]", jobType, payload);
  }

  private static categorizeError(error: string): string {
    if (error.includes("timeout")) return "TIMEOUT";
    if (error.includes("INSUFFICIENT_STOCK")) return "VALIDATION";
    if (error.includes("not found")) return "NOT_FOUND";
    return "EXCEPTION";
  }
};

export class DLQReplayService {
  static async replay(dlqJobUuid: string, retryBy: string) {
    const job = await prisma.deadLetterJob.findUnique({
      where: { uuid: dlqJobUuid },
    });

    if (!job || job.resolved) {
      throw new Error("Job not found or already resolved");
    }

    try {
      // Attempt retry
      switch (job.jobType) {
        case "CREATE_ORDER":
          await OrderCommandService.createOrder(job.payload);
          break;

        case "PROCESS_PAYMENT":
          // await PaymentService.process(job.payload);
          break;

        default:
          throw new Error(`Unknown job type: ${job.jobType}`);
      }

      // Mark as resolved
      await prisma.deadLetterJob.update({
        where: { uuid: dlqJobUuid },
        data: {
          status: "RESOLVED",
          resolved: true,
          resolvedAt: new Date(),
          resolvedBy: retryBy,
          resolution: "REQUEUED",
        },
      });

      // Create retry record
      await prisma.dLQRetry.create({
        data: {
          dlqJobUuid,
          attemptNumber: job.retryCount + 1,
          status: "SUCCESS",
          completedAt: new Date(),
        },
      });
    } catch (error: any) {
      await prisma.deadLetterJob.update({
        where: { uuid: dlqJobUuid },
        data: {
          retryCount: { increment: 1 },
          lastRetryAt: new Date(),
        },
      });

      await prisma.dLQRetry.create({
        data: {
          dlqJobUuid,
          attemptNumber: job.retryCount + 1,
          status: "FAILED",
          error: error.message,
          completedAt: new Date(),
        },
      });

      throw error;
    }
  }
}
  