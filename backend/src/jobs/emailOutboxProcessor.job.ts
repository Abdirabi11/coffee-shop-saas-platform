import prisma from "../config/prisma.ts"
import { EmailService } from "../services/notification/Email.service.ts";
import { logWithContext } from "../infrastructure/observability/Logger.ts";
import { MetricsService } from "../infrastructure/observability/MetricsService.ts";

const BATCH_SIZE = 20;
// A row left PROCESSING this long was claimed by a run that died mid-send
const STUCK_AFTER_MS = 10 * 60 * 1000;
// Retry delay after the nth failed attempt: 1, 2, 4, 8... minutes, capped
const retryDelayMs = (attempts: number) => Math.min(2 ** (attempts - 1), 60) * 60 * 1000;

// Sends queued EmailOutbox rows through EmailService, rendering each row's
// templateKey with its templateData. Runs every minute under a job lock.
export class EmailOutboxProcessorJob {
    static cronSchedule = "* * * * *";

    static async run() {
        const now = new Date();

        // Delivery is at-least-once: a send that died before marking the row
        // goes out again
        const recovered = await prisma.emailOutbox.updateMany({
            where: { status: "PROCESSING", lastAttemptAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } },
            data: { status: "PENDING" },
        });
        if (recovered.count > 0) {
            logWithContext("warn", "[EmailOutbox] Requeued stuck emails", { count: recovered.count });
        }

        const expired = await prisma.emailOutbox.updateMany({
            where: { status: "PENDING", expiresAt: { lte: now } },
            data: { status: "EXPIRED" },
        });
        if (expired.count > 0) {
            logWithContext("info", "[EmailOutbox] Expired unsent emails", { count: expired.count });
        }

        const due = await prisma.emailOutbox.findMany({
            where: {
                status: "PENDING",
                AND: [
                    { OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] },
                    { OR: [{ sendAfter: null }, { sendAfter: { lte: now } }] },
                    { OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] },
                ],
            },
            // Enum order: HIGH/URGENT ahead of NORMAL/LOW isn't alphabetical,
            // so take oldest first and let the batch size keep latency low
            orderBy: { createdAt: "asc" },
            take: BATCH_SIZE,
            select: { uuid: true },
        });

        let sent = 0;
        let failed = 0;
        for (const { uuid } of due) {
            const outcome = await this.process(uuid);
            if (outcome === "SENT") sent++;
            else if (outcome === "FAILED") failed++;
        }

        if (due.length > 0) {
            logWithContext("info", "[EmailOutbox] Batch processed", { due: due.length, sent, failed });
        }
        return { due: due.length, sent, failed, recovered: recovered.count, expired: expired.count };
    }

    private static async process(emailUuid: string): Promise<"SENT" | "FAILED" | "RETRY" | "SKIPPED"> {
        // Claim: only one run moves a row PENDING -> PROCESSING
        const claimed = await prisma.emailOutbox.updateMany({
            where: { uuid: emailUuid, status: "PENDING" },
            data: { status: "PROCESSING", attempts: { increment: 1 }, lastAttemptAt: new Date() },
        });
        if (claimed.count === 0) return "SKIPPED";

        const email = await prisma.emailOutbox.findUniqueOrThrow({ where: { uuid: emailUuid } });

        const error = await this.send(email);

        if (!error) {
            await prisma.emailOutbox.update({
                where: { uuid: emailUuid },
                data: { status: "SENT", sentAt: new Date(), lastError: null, nextRetryAt: null },
            });
            MetricsService.increment("email.outbox.sent", 1, { template: email.templateKey ?? "none" });
            return "SENT";
        }

        const permanent = error.permanent || email.attempts >= email.maxAttempts;
        await prisma.emailOutbox.update({
            where: { uuid: emailUuid },
            data: permanent
                ? { status: "FAILED", lastError: error.message, nextRetryAt: null }
                : { status: "PENDING", lastError: error.message, nextRetryAt: new Date(Date.now() + retryDelayMs(email.attempts)) },
        });

        if (permanent) {
            MetricsService.increment("email.outbox.failed", 1, { template: email.templateKey ?? "none" });
            logWithContext("error", "[EmailOutbox] Email failed permanently", {
                emailUuid,
                template: email.templateKey,
                attempts: email.attempts,
                error: error.message,
            });
            return "FAILED";
        }

        logWithContext("warn", "[EmailOutbox] Send failed, will retry", {
            emailUuid,
            attempts: email.attempts,
            error: error.message,
        });
        return "RETRY";
    }

    // Null on success; permanent errors aren't retried
    private static async send(email: {
        to: string[];
        subject: string;
        replyTo: string | null;
        templateKey: string | null;
        templateData: unknown;
    }): Promise<{ message: string; permanent: boolean } | null> {
        const recipients = email.to.map((address) => address.trim()).filter(Boolean);
        if (recipients.length === 0) return { message: "NO_RECIPIENTS", permanent: true };
        if (!email.templateKey) return { message: "NO_TEMPLATE", permanent: true };

        const result = await EmailService.send({
            to: recipients.join(", "),
            subject: email.subject,
            template: email.templateKey,
            data: email.templateData ?? {},
            replyTo: email.replyTo ?? undefined,
        });
        return result.success ? null : { message: result.error ?? "SEND_FAILED", permanent: false };
    }
}
