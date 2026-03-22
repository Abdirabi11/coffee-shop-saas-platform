import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";

export class LedgerService{
    static async record(entry: {
        type: "DEBIT" | "CREDIT";
        amount: number;
        currency: string;
        walletUuid: string;
        refType: "PAYMENT" | "REFUND";
        refUuid: string;
    }) {
        const existing = await prisma.ledgerEntry.findFirst({
            where: {
                refType: entry.refType,
                refUuid: entry.refUuid,
                walletUuid: entry.walletUuid,
            },
        });
    
        if (existing) {
            logWithContext("info", "[Ledger] Entry already exists (idempotent)", {
                refType: entry.refType,
                refUuid: entry.refUuid,
            });
            return existing;
        }
 
        return prisma.$transaction(async (tx) => {
            if (entry.type === "DEBIT") {
                const wallet = await tx.wallet.findUnique({
                    where: { uuid: entry.walletUuid },
                });
        
                if (!wallet) {
                    throw new Error("WALLET_NOT_FOUND");
                }
        
                if (wallet.balance < entry.amount) {
                    throw new Error("INSUFFICIENT_WALLET_BALANCE");
                }
            };
    
            const ledgerEntry = await tx.ledgerEntry.create({
                data: entry,
            });
        
            // Update wallet balance atomically
            if (entry.type === "CREDIT") {
                await tx.wallet.update({
                    where: { uuid: entry.walletUuid },
                    data: { balance: { increment: entry.amount } },
                });
            } else {
                await tx.wallet.update({
                    where: { uuid: entry.walletUuid },
                    data: { balance: { decrement: entry.amount } },
                });
            }
    
            logWithContext("info", "[Ledger] Entry recorded", {
                type: entry.type,
                amount: entry.amount,
                walletUuid: entry.walletUuid,
                refType: entry.refType,
                refUuid: entry.refUuid,
            });
        
            return ledgerEntry;
        });
    }
};