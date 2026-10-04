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

export class SyncController {
    //POST /api/sync/orders
    //Sync order from client
    static async syncOrder(req: Request, res: Response){
        const traceId = req.headers["x-trace-id"] as string || `sync_${Date.now()}`;

        try {
            const tenantUuid = req.tenant?.uuid;
            const tenantUserUuid = req.tenantUser?.uuid;
            const userUuid = req.user?.userUuid;
            if (!tenantUuid || !tenantUserUuid || !userUuid) {
                return res.status(400).json({ success: false, error: "TENANT_CONTEXT_REQUIRED" });
            }
            const { operation, clientOrderUuid, data, syncVersion } = req.body;
            
            logWithContext("info", "[Sync] Order sync request", {
                traceId,
                operation,
                clientOrderUuid,
                syncVersion,
            });
            
            // Sync order
            // Ownership comes from the request context; any tenantUuid /
            // tenantUserUuid inside `data` is ignored by the service.
            const result = await OrderSyncService.syncFromClient({
                tenantUuid,
                tenantUserUuid,
                userUuid,
                clientOrder: { ...data, clientOrderUuid },
                deviceId: req.headers["x-device-id"] as string,
                operation,
            });

            if (!result.success) {
                return res.status(422).json({
                    success: false,
                    error: result.error,
                    requiresManualReview: result.requiresManualReview,
                });
            }

            if (result.resolution === "SERVER_WINS") {
                // Conflict detected
                logWithContext("warn", "[Sync] Order sync conflict", {
                    traceId,
                    clientOrderUuid,
                    resolution: result.resolution,
                });
                
                return res.status(409).json({
                    conflict: true,
                    resolution: result.resolution,
                    serverData: result.serverOrder,
                    clientData: data,
                    message: "Conflict detected - review required",
                });
            }
      
            logWithContext("info", "[Sync] Order synced successfully", {
                traceId,
                serverOrderUuid: result.serverOrderUuid,
            });
            
            MetricsService.increment("sync.order.success", 1, {
                operation,
            });
      
            return res.status(200).json({
                success: true,
                serverOrderUuid: result.serverOrderUuid,
                orderNumber: result.orderNumber,
                totalAmount: result.totalAmount,
                priceAdjusted: result.priceAdjusted ?? false,
                replayed: result.replayed ?? false,
                resolution: result.resolution,
                serverTimestamp: Date.now(),
            });
        } catch (error: any) {
            if (error.message === "STORE_ACCESS_DENIED") {
                return res.status(403).json({ success: false, error: "STORE_ACCESS_DENIED" });
            }

            logWithContext("error", "[Sync] Order sync failed", {
                traceId,
                error: error.message,
            });
              
            MetricsService.increment("sync.order.failed", 1);
              
            return res.status(500).json({
                success: false,
                error: error.message,
                retryable: SyncController.isRetryableError(error),
            });
        }
    }

    //POST /api/sync/payments
    //Sync payment from client
    static async syncPayment(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `sync_${Date.now()}`;

        try {
            const tenantUuid = req.tenant!.uuid;
            const { operation, clientPaymentUuid, data } = req.body;
            
            logWithContext("info", "[Sync] Payment sync request", {
                traceId,
                operation,
                clientPaymentUuid,
            });
            
            // Sync payment
            const result = await PaymentSyncService.sync({
                tenantUuid,
                operation,
                clientPaymentUuid,
                clientData: data,
            });
        } catch (error: any) {
            logWithContext("error", "[Sync] Payment sync failed", {
                traceId,
                error: error.message,
            });
              
            return res.status(500).json({
                success: false,
                error: error.message,
            });
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

    //Check if error is retryable
    private static isRetryableError(error: any): boolean {
        const retryableErrors = [
            "NETWORK_ERROR",
            "TIMEOUT",
            "SERVER_OVERLOAD",
        ];
        
        return retryableErrors.some(e => error.message.includes(e));
    }
}