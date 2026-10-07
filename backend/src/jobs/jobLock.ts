import crypto from "node:crypto";
import os from "node:os";
import prisma from "../config/prisma.ts";
import { logWithContext } from "../infrastructure/observability/Logger.ts";

// Run each scheduled job on at most one instance at a time, and never twice
// at once on the same instance.
//
// Every server instance runs the scheduler, so without this each replica
// fires every job at the same minute (two RefundProcessorJob runs = two
// refunds). The cross-instance lock is a lease row in JobLock rather than a
// Postgres advisory lock: Prisma pools connections, so a session lock can't
// be released reliably (unlock may run on another connection), and a
// transaction-scoped lock would pin one pooled connection idle for each
// running job, starving the jobs and HTTP traffic at the busy :00/:05 marks.
//
// The lease is renewed while the job runs; if the instance dies, it expires
// after LEASE_SECONDS and another instance can take the job on its next tick. All
// lease times use the database clock, so instance clock skew doesn't matter.
// They are UTC (now() AT TIME ZONE 'UTC'): the columns are `timestamp`
// without zone and Prisma stores DateTimes as UTC there, while bare now()
// would compare in the DB session's local time zone.

const LEASE_SECONDS = 120;
const RENEW_EVERY_MS = 30 * 1000;
const INSTANCE = `${os.hostname()}:${process.pid}`;

// Jobs running on this instance
const runningHere = new Set<string>();

async function acquire(jobName: string, lockToken: string): Promise<boolean> {
    // Take the lease if it doesn't exist or has expired, in one statement
    const rows = await prisma.$queryRaw<Array<{ jobName: string }>>`
        INSERT INTO "JobLock" ("jobName", "lockToken", "lockedBy", "lockedUntil", "acquiredAt")
        VALUES (${jobName}, ${lockToken}, ${INSTANCE}, (now() AT TIME ZONE 'UTC') + ${LEASE_SECONDS}::int * interval '1 second', (now() AT TIME ZONE 'UTC'))
        ON CONFLICT ("jobName") DO UPDATE
            SET "lockToken" = EXCLUDED."lockToken",
                "lockedBy" = EXCLUDED."lockedBy",
                "lockedUntil" = EXCLUDED."lockedUntil",
                "acquiredAt" = EXCLUDED."acquiredAt"
            WHERE "JobLock"."lockedUntil" < (now() AT TIME ZONE 'UTC')
        RETURNING "jobName"
    `;
    return rows.length === 1;
}

async function renew(jobName: string, lockToken: string): Promise<boolean> {
    const updated = await prisma.$executeRaw`
        UPDATE "JobLock"
        SET "lockedUntil" = (now() AT TIME ZONE 'UTC') + ${LEASE_SECONDS}::int * interval '1 second'
        WHERE "jobName" = ${jobName} AND "lockToken" = ${lockToken}
    `;
    return updated === 1;
}

async function release(jobName: string, lockToken: string): Promise<void> {
    // Expire it now so the next tick on any instance can take it. Matching on
    // lockToken means a holder whose lease was taken over can't release the
    // new holder's lease.
    await prisma.$executeRaw`
        UPDATE "JobLock" SET "lockedUntil" = (now() AT TIME ZONE 'UTC')
        WHERE "jobName" = ${jobName} AND "lockToken" = ${lockToken}
    `;
}

// Runs fn if this instance gets the job's lease; otherwise skips and returns
// { ran: false }. Errors from fn propagate after the lease is released.
export async function withJobLock<T>(
    jobName: string,
    fn: () => Promise<T>
): Promise<{ ran: true; result: T } | { ran: false; reason: "RUNNING_HERE" | "LOCKED_ELSEWHERE" }> {
    if (runningHere.has(jobName)) {
        logWithContext("warn", "[JobLock] Previous run still in progress here, skipping", { jobName });
        return { ran: false, reason: "RUNNING_HERE" };
    }

    runningHere.add(jobName);
    const lockToken = crypto.randomUUID();
    let renewTimer: NodeJS.Timeout | undefined;

    try {
        if (!(await acquire(jobName, lockToken))) {
            logWithContext("info", "[JobLock] Held by another instance, skipping", { jobName });
            return { ran: false, reason: "LOCKED_ELSEWHERE" };
        }

        renewTimer = setInterval(() => {
            renew(jobName, lockToken)
                .then((held) => {
                    if (!held) {
                        logWithContext("error", "[JobLock] Lease lost while job still running", { jobName });
                    }
                })
                .catch((error) => {
                    logWithContext("error", "[JobLock] Lease renewal failed", { jobName, error: error.message });
                });
        }, RENEW_EVERY_MS);
        renewTimer.unref();

        try {
            return { ran: true, result: await fn() };
        } finally {
            clearInterval(renewTimer);
            await release(jobName, lockToken).catch((error) => {
                // The lease still expires on its own after LEASE_SECONDS
                logWithContext("error", "[JobLock] Release failed", { jobName, error: error.message });
            });
        }
    } finally {
        runningHere.delete(jobName);
    }
}
