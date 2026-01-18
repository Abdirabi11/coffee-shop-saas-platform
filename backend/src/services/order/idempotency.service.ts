import prisma from "../config/config.ts"

export class IdempotencyService{
    static async check(key: string){
        return prisma.idempotencyKey.findUnique({
            where: {key}
        })
    };
    
    static async store(key: string, orderUuid: string){
        await prisma.idempotencyKey.create({
            data: { key, orderUuid },
        })
    }
};