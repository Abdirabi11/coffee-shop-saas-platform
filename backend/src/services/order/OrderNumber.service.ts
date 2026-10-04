import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

// Format: ORD-20260328-0001 (UTC date + daily sequence per tenant).
//
// Order numbers are unique per tenant (@@unique([tenantUuid, orderNumber])),
// so the sequence is per tenant, not per store. A transaction-scoped advisory
// lock serializes number allocation for one tenant/day: concurrent callers
// wait until the holder commits, then see its order when they read the max.
//
// MUST be called inside the same transaction that inserts the order, or the
// lock is released before the insert and the race comes back.
export class OrderNumberService {
    static async next(tx: Tx, tenantUuid: string): Promise<string> {
        const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const prefix = `ORD-${day}-`;

        await tx.$executeRaw`
            SELECT pg_advisory_xact_lock(hashtextextended(${`order-number:${tenantUuid}:${day}`}::text, 0))
        `;

        // MAX of the numeric suffix rather than COUNT, so deleted orders or
        // numbers past 9999 can't produce a duplicate. The CASE guards the
        // cast (WHERE clause evaluation order isn't guaranteed).
        const rows = await tx.$queryRaw<Array<{ max: number | null }>>`
            SELECT MAX(
                CASE WHEN suffix ~ '^[0-9]{1,9}$' THEN CAST(suffix AS INTEGER) END
            ) AS max
            FROM (
                SELECT SUBSTRING("orderNumber" FROM ${prefix.length + 1}::int) AS suffix
                FROM "Order"
                WHERE "tenantUuid" = ${tenantUuid}
                  AND "orderNumber" LIKE ${prefix + "%"}
            ) AS numbered
        `;

        const next = Number(rows[0]?.max ?? 0) + 1;
        return `${prefix}${String(next).padStart(4, "0")}`;
    }
}
