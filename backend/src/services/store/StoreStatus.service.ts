import type { Prisma } from "@prisma/client";
import prisma from "../../config/prisma.ts";

type Client = Prisma.TransactionClient | typeof prisma;

// Whether a store may do business: new orders, offline order sync, clock-ins,
// PIN logins, opening cash drawers. A store is operational when it is active,
// its status is ACTIVE and it isn't deleted, and its tenant is ACTIVE.
// Viewing and managing the store (reports, settings) is unaffected.
export class StoreStatusService {

    static async isOperational(storeUuid: string, client: Client = prisma): Promise<boolean> {
        const store = await client.store.findUnique({
            where: { uuid: storeUuid },
            select: { active: true, status: true, deletedAt: true, tenant: { select: { status: true } } },
        });
        return !!store && store.active && store.status === "ACTIVE" && !store.deletedAt && store.tenant.status === "ACTIVE";
    }

    // Throws STORE_INACTIVE unless the store is operational
    static async assertOperational(storeUuid: string, client: Client = prisma) {
        if (!(await this.isOperational(storeUuid, client))) {
            throw new Error("STORE_INACTIVE");
        }
    }
}
