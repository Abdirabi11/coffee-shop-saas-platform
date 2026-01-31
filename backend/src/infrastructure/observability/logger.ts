import pino from "pino";

export const logger = pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: {
      service: "payment-service",
    },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
});

export function logWithContext(
    level: "info" | "warn" | "error",
    message: string,
    context: {
      traceId?: string;
      paymentUuid?: string;
      orderUuid?: string;
      provider?: string;
      providerRef?: string;
      failureCode?: string;
      retryCount?: number;
      webhookEventId?: string;
      [key: string]: any;
    }
  ) {
    logger[level]({
      msg: message,
      ...context,
    });
};