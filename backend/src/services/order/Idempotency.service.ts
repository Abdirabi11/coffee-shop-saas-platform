import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "../../config/prisma.ts"

// Sorts object keys at every level so the hash doesn't depend on property
// order; undefined fields drop out as in JSON.stringify. Array order counts.
function canonicalJson(value: unknown): string {
    return JSON.stringify(value, (_key, v) =>
        v && typeof v === "object" && !Array.isArray(v)
            ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
            : v
    );
}

export class IdempotencyService{
    // SHA-256 of the request payload, stored with the key so a reused key
    // with a different payload is rejected instead of replaying a response
    // that belongs to another request.
    static hashRequest(payload: unknown): string {
        return crypto.createHash("sha256").update(canonicalJson(payload)).digest("hex");
    }

    // Returns the stored response for a completed key, or null if there is
    // none. With requestHash, throws IDEMPOTENCY_KEY_MISMATCH if the key was
    // first used for a different payload. Keys stored before hashing existed
    // (requestHash null) skip the comparison.
    static async check(
        tenantUuid: string,
        key: string,
        route: string,
        requestHash?: string
    ): Promise<{ response: string; statusCode: number } | null>{
        const existing = await prisma.idempotencyKey.findUnique({
            where: {
                tenantUuid_key_route: {
                    tenantUuid,
                    key,
                    route,
                },
            },
        });

        if (!existing) return null;
        if (existing.expiresAt < new Date()) {
            // deleteMany: a concurrent check may have removed it already
            await prisma.idempotencyKey.deleteMany({
                where: { uuid: existing.uuid },
            });
            return null;
        };

        if (requestHash && existing.requestHash && existing.requestHash !== requestHash) {
            throw new Error("IDEMPOTENCY_KEY_MISMATCH");
        }

        return {
            response: JSON.stringify(existing.response),
            statusCode: existing.statusCode,
        };
    };
    
    // Reserve the key inside the caller's transaction, before doing the work.
    // The unique (tenantUuid, key, route) index makes a concurrent claim of
    // the same key wait for this transaction, then fail with P2002 if it
    // commits (see isClaimConflict) or succeed if it rolls back. The
    // placeholder response is never visible: complete() overwrites it in the
    // same transaction.
    static async claim(
        tx: Prisma.TransactionClient,
        tenantUuid: string,
        key: string,
        route: string,
        requestHash: string,
        expiresInHours: number = 24
    ) {
        // An expired key may be reused
        await tx.idempotencyKey.deleteMany({
            where: { tenantUuid, key, route, expiresAt: { lt: new Date() } },
        });

        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + expiresInHours);

        await tx.idempotencyKey.create({
            data: {
                tenantUuid,
                key,
                route,
                requestHash,
                response: {},
                statusCode: 0,
                expiresAt,
            },
        });
    }

    static async complete(
        tx: Prisma.TransactionClient,
        tenantUuid: string,
        key: string,
        route: string,
        response: unknown,
        statusCode: number
    ) {
        await tx.idempotencyKey.update({
            where: { tenantUuid_key_route: { tenantUuid, key, route } },
            // Round-trip through JSON so Dates are stored as ISO strings
            data: { response: JSON.parse(JSON.stringify(response)), statusCode },
        });
    }

    static isClaimConflict(error: unknown): boolean {
        return (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002" &&
            error.meta?.modelName === "IdempotencyKey"
        );
    }

    static async cleanup() {
        await prisma.idempotencyKey.deleteMany({
          where: {
            expiresAt: { lt: new Date() },
          },
        });
     }
};


