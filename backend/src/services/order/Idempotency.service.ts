import { Prisma } from "@prisma/client";
import prisma from "../../config/prisma.ts"

export class IdempotencyService{
    static async check(
        tenantUuid: string,
        key: string,
        route: string
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
            await prisma.idempotencyKey.delete({
                where: { uuid: existing.uuid },
            });
            return null;
        };

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
                requestHash: null,
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


