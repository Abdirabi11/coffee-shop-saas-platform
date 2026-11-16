import { Request, Response } from "express";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { OrderSyncService } from "../../services/sync/OrderSync.service.ts";

// ─── Delta pull cursor ──────────────────────────────────────────────────────
// Rows are ordered by (updatedAt, uuid). The uuid tiebreak means a page can
// end in the middle of rows sharing a timestamp without skipping any.

type SyncCursor = { t: number; id: string };
type PullCursor = { orders: SyncCursor; products: SyncCursor; payments: SyncCursor };

const PULL_PAGE_SIZE = { orders: 50, products: 100, payments: 50 } as const;
const PULL_SAFETY_LAG_MS = 2000;

function cursorWhere(cursor: SyncCursor, upperBound: Date) {
    const t = new Date(cursor.t);
    return {
        AND: [
            { updatedAt: { lte: upperBound } },
            {
                OR: [
                    { updatedAt: { gt: t } },
                    { updatedAt: t, uuid: { gt: cursor.id } },
                ],
            },
        ],
    };
}

function paginate<T extends { uuid: string; updatedAt: Date }>(
    fetched: T[],
    pageSize: number,
    previous: SyncCursor,
    upperBound: Date
) {
    const hasMore = fetched.length > pageSize;
    const rows = hasMore ? fetched.slice(0, pageSize) : fetched;
    const last = rows[rows.length - 1];

    let next: SyncCursor;
    if (hasMore) {
        // More rows remain; resume right after the last one sent
        next = { t: last.updatedAt.getTime(), id: last.uuid };
    } else if (last && last.updatedAt.getTime() === upperBound.getTime()) {
        // Caught up, but rows sit exactly on the bound; resume after them
        next = { t: last.updatedAt.getTime(), id: last.uuid };
    } else {
        // Caught up to the bound; nothing at or before it is left
        next = { t: Math.max(previous.t, upperBound.getTime()), id: "" };
    }

    return { rows, next, hasMore };
}

function encodePullCursor(cursor: PullCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodePullCursor(raw: string): PullCursor | null {
    try {
        const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
        const valid = (c: any) =>
            c && Number.isFinite(c.t) && c.t >= 0 && typeof c.id === "string";
        if (valid(parsed?.orders) && valid(parsed?.products) && valid(parsed?.payments)) {
            return parsed as PullCursor;
        }
        return null;
    } catch {
        return null;
    }
}

const MAX_SYNC_BATCH = 50;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Errors that mean the order itself can't be accepted as sent (bad items,
// unknown product, out of stock): resending won't help. Anything else
// failed on the server side and is worth retrying.
const FINAL_SYNC_ERRORS = new Set([
    "ORDER_EMPTY", "TOO_MANY_ITEMS", "INVALID_ORDER_ITEM", "INVALID_MODIFIERS",
    "PRODUCT_NOT_FOUND", "OUT_OF_STOCK", "INVENTORY_NOT_FOUND", "CLIENT_ORDER_UUID_CONFLICT",
]);

// "INVALID_MODIFIERS: option x ..." -> "INVALID_MODIFIERS"; the pricing
// service's "Product not found: <uuid>" -> "PRODUCT_NOT_FOUND"
function syncErrorCode(message: string | undefined): string {
    if (!message) return "SYNC_FAILED";
    if (message.startsWith("Product not found")) return "PRODUCT_NOT_FOUND";
    const code = message.split(":")[0].trim();
    return /^[A-Z][A-Z0-9_]*$/.test(code) ? code : "SYNC_FAILED";
}

type SyncOrderResult = {
    clientOrderUuid: string;
    status: "CREATED" | "REPLAYED" | "UPDATED" | "CONFLICT" | "REJECTED";
    serverOrderUuid?: string;
    orderNumber?: string;
    totalAmount?: number;
    priceAdjusted?: boolean;
    resolution?: "CLIENT_WINS" | "SERVER_WINS";
    serverOrder?: unknown;
    error?: string;
    message?: string;
    requiresManualReview?: boolean;
    retryable?: boolean;
};

export class SyncController {
    // POST /api/staff/offline/sync-orders
    //
    // The POS pushes the orders it created offline once it reconnects.
    // Body: { orders: [{ clientOrderUuid, storeUuid, orderType, items,
    //   status, createdAt, lastModifiedAt, totalAmount?, tableNumber?,
    //   customerNotes?, operation? ("CREATE" default | "UPDATE") }] }
    // Header: x-device-id (recorded with each order).
    //
    // Each order is applied on its own, in the order sent, and gets its own
    // result, so one bad order doesn't hold back the rest. Safe to retry the
    // whole batch: clientOrderUuid is the idempotency key, and an order that
    // already landed comes back REPLAYED. Prices are always the server's
    // (priceAdjusted flags a different client total). Orders are created
    // PENDING; take payment through /api/cashier/process once synced.
    //
    // 200 { results: [{ clientOrderUuid, status, ... }], summary } where status
    // is CREATED | REPLAYED | UPDATED | CONFLICT | REJECTED. A REJECTED result
    // with retryable: true failed on the server side and can be resent as is.
    static async syncOrders(req: Request, res: Response) {
        const traceId = (req.headers["x-trace-id"] as string) || `sync_${Date.now()}`;

        const tenantUuid = req.tenant?.uuid;
        const tenantUserUuid = req.tenantUser?.uuid;
        const userUuid = req.user?.userUuid;
        if (!tenantUuid || !tenantUserUuid || !userUuid) {
            return res.status(400).json({ success: false, error: "TENANT_CONTEXT_REQUIRED" });
        }

        const orders = req.body?.orders;
        if (!Array.isArray(orders) || orders.length === 0 || orders.length > MAX_SYNC_BATCH) {
            return res.status(400).json({
                success: false,
                error: "INVALID_SYNC_BATCH",
                message: `orders must be an array of 1-${MAX_SYNC_BATCH} orders`,
            });
        }

        const rawDeviceId = req.headers["x-device-id"];
        const deviceId = typeof rawDeviceId === "string" ? rawDeviceId.slice(0, 200) : "unknown";

        const results: SyncOrderResult[] = [];
        for (const entry of orders) {
            results.push(await SyncController.syncOne({ tenantUuid, tenantUserUuid, userUuid, deviceId, entry, traceId }));
        }

        const summary: Record<SyncOrderResult["status"], number> = {
            CREATED: 0, REPLAYED: 0, UPDATED: 0, CONFLICT: 0, REJECTED: 0,
        };
        for (const r of results) summary[r.status]++;

        logWithContext("info", "[Sync] Order batch synced", { traceId, deviceId, ...summary });
        MetricsService.increment("sync.order.batch", 1);

        return res.status(200).json({ success: true, results, summary, serverTimestamp: Date.now() });
    }

    private static async syncOne(input: {
        tenantUuid: string;
        tenantUserUuid: string;
        userUuid: string;
        deviceId: string;
        entry: any;
        traceId: string;
    }): Promise<SyncOrderResult> {
        const { entry } = input;
        const clientOrderUuid = typeof entry?.clientOrderUuid === "string" ? entry.clientOrderUuid : "";

        // It becomes the order's primary key, so it must be a real UUID
        if (!UUID_PATTERN.test(clientOrderUuid)) {
            return { clientOrderUuid, status: "REJECTED", error: "INVALID_CLIENT_ORDER_UUID", retryable: false };
        }
        const operation = entry.operation === "UPDATE" ? "UPDATE" : "CREATE";

        try {
            // Ownership comes from the request context; any tenantUuid /
            // tenantUserUuid in the entry is ignored by the service.
            const result = await OrderSyncService.syncFromClient({
                tenantUuid: input.tenantUuid,
                tenantUserUuid: input.tenantUserUuid,
                userUuid: input.userUuid,
                clientOrder: { ...entry, clientOrderUuid },
                deviceId: input.deviceId,
                operation,
            });

            if (!result.success) {
                MetricsService.increment("sync.order.failed", 1);
                const code = syncErrorCode(result.error);
                const final = FINAL_SYNC_ERRORS.has(code);
                return {
                    clientOrderUuid,
                    status: "REJECTED",
                    error: code,
                    // Details for a final error (which modifier, which product);
                    // internal messages stay in the server log
                    ...(final && result.error !== code && { message: result.error }),
                    requiresManualReview: result.requiresManualReview,
                    retryable: !final,
                };
            }

            const base = {
                clientOrderUuid,
                serverOrderUuid: result.serverOrderUuid,
                orderNumber: result.orderNumber,
                totalAmount: result.totalAmount,
            };

            if (result.resolution === "SERVER_WINS") {
                logWithContext("warn", "[Sync] Order sync conflict", { traceId: input.traceId, clientOrderUuid });
                return { ...base, status: "CONFLICT", resolution: "SERVER_WINS", serverOrder: result.serverOrder };
            }
            MetricsService.increment("sync.order.success", 1, { operation });
            if (result.replayed) return { ...base, status: "REPLAYED" };
            if (result.resolution === "CLIENT_WINS") return { ...base, status: "UPDATED", resolution: "CLIENT_WINS" };
            return { ...base, status: "CREATED", priceAdjusted: result.priceAdjusted ?? false };
        } catch (error: any) {
            // Thrown before the order is touched: access and store state
            if (error.message === "STORE_ACCESS_DENIED" || error.message === "STORE_INACTIVE") {
                return { clientOrderUuid, status: "REJECTED", error: error.message, retryable: false };
            }

            logWithContext("error", "[Sync] Order sync failed", {
                traceId: input.traceId,
                clientOrderUuid,
                error: error.message,
            });
            MetricsService.increment("sync.order.failed", 1);
            // Unexpected server error; resending is safe (idempotent)
            return { clientOrderUuid, status: "REJECTED", error: "SYNC_FAILED", retryable: true };
        }
    }

    //GET /api/sync/pull
    //Pull changes from server (delta sync)
    //
    // Query: ?cursor=<opaque nextCursor from the previous pull>
    //        ?lastSyncTimestamp=<ms>  (legacy; only used when no cursor is sent)
    // Response: { changes, nextCursor, hasMore, serverTimestamp }
    // Clients must persist `nextCursor` and keep pulling while `hasMore`.
    static async pullChanges(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `sync_${Date.now()}`;

        try {
            const tenantUuid = req.tenant?.uuid;
            const storeUuid = req.store?.uuid;
            if (!tenantUuid || !storeUuid) {
                return res.status(400).json({ success: false, error: "STORE_CONTEXT_REQUIRED" });
            }

            const cursor = SyncController.parsePullCursor(req.query);
            if (!cursor) {
                return res.status(400).json({ success: false, error: "INVALID_SYNC_CURSOR" });
            }

            // Fix the upper bound BEFORE querying. Every query reads up to the
            // same instant, so a write that lands while we query is picked up
            // by the next pull instead of falling behind the client's cursor.
            // The lag leaves room for in-flight transactions whose updatedAt
            // is slightly older than their commit time.
            const upperBound = new Date(Date.now() - PULL_SAFETY_LAG_MS);

            logWithContext("info", "[Sync] Pull changes request", {
                traceId,
                upperBound: upperBound.toISOString(),
            });

            const result = await SyncController.getChangesSince({
                tenantUuid,
                storeUuid,
                cursor,
                upperBound,
            });

            return res.status(200).json({
                success: true,
                changes: result.changes,
                nextCursor: encodePullCursor(result.nextCursor),
                hasMore: result.hasMore,
                serverTimestamp: upperBound.getTime(),
            });
      
        } catch (error: any) {
            logWithContext("error", "[Sync] Pull changes failed", {
                traceId,
                error: error.message,
            });
              
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    private static parsePullCursor(query: Request["query"]): PullCursor | null {
        if (typeof query.cursor === "string") {
            return decodePullCursor(query.cursor);
        }

        // Legacy timestamp: start every entity at that instant. Rows exactly
        // at the timestamp are re-sent (duplicates are safe; gaps are not).
        let t = 0;
        if (query.lastSyncTimestamp !== undefined) {
            t = Number(query.lastSyncTimestamp);
            if (!Number.isFinite(t) || t < 0) return null;
        }
        const start = { t, id: "" };
        return { orders: start, products: start, payments: start };
    }

    //Get changes after each entity's (updatedAt, uuid) cursor, up to upperBound
    private static async getChangesSince(input: {
        tenantUuid: string;
        storeUuid: string;
        cursor: PullCursor;
        upperBound: Date;
    }) {
        const scope = { tenantUuid: input.tenantUuid, storeUuid: input.storeUuid };
        const orderBy = [{ updatedAt: "asc" as const }, { uuid: "asc" as const }];

        // take = page size + 1 so we know whether another page exists
        // TODO(schema): Order has no deviceId column, so changes from the
        // requesting device can't be excluded yet.
        const [orders, products, payments] = await Promise.all([
            prisma.order.findMany({
                where: { ...scope, ...cursorWhere(input.cursor.orders, input.upperBound) },
                include: { items: true },
                orderBy,
                take: PULL_PAGE_SIZE.orders + 1,
            }),
            prisma.product.findMany({
                where: { ...scope, ...cursorWhere(input.cursor.products, input.upperBound) },
                orderBy,
                take: PULL_PAGE_SIZE.products + 1,
            }),
            prisma.payment.findMany({
                where: { ...scope, ...cursorWhere(input.cursor.payments, input.upperBound) },
                orderBy,
                take: PULL_PAGE_SIZE.payments + 1,
            }),
        ]);

        const o = paginate(orders, PULL_PAGE_SIZE.orders, input.cursor.orders, input.upperBound);
        const pr = paginate(products, PULL_PAGE_SIZE.products, input.cursor.products, input.upperBound);
        const pa = paginate(payments, PULL_PAGE_SIZE.payments, input.cursor.payments, input.upperBound);

        return {
            changes: { orders: o.rows, products: pr.rows, payments: pa.rows },
            nextCursor: { orders: o.next, products: pr.next, payments: pa.next },
            hasMore: o.hasMore || pr.hasMore || pa.hasMore,
        };
    }
}