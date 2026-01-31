import prisma from "../../config/prisma.ts"

export class LedgerService{
    static async record(entry: {
        type: "DEBIT" | "CREDIT";
        amount: number;
        currency: string;
        walletUuid: string;
        refType: "PAYMENT" | "REFUND";
        refUuid: string;
    }){
        await prisma.ledgerEntry.create({
            data: entry,
        });
    }
};