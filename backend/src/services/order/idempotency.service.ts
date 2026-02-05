import prisma from "../config/config.ts"

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
    
    static async store(
        tenantUuid: string,
        key: string,
        route: string,
        response: string,
        statusCode: number,
        expiresInHours: number = 24
    ){
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + expiresInHours);

        await prisma.idempotencyKey.create({
            data: {
              tenantUuid,
              key,
              route,
              requestHash: null, 
              response: JSON.parse(response),
              statusCode,
              expiresAt,
            },
        });
    }

    static async cleanup() {
        await prisma.idempotencyKey.deleteMany({
          where: {
            expiresAt: { lt: new Date() },
          },
        });
     }
};