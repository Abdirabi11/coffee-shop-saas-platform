import type { LedgerEntryType, Prisma } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

type Client = Prisma.TransactionClient | typeof prisma;

// Store-level accounts the ledger posts between. Money held: the cash
// drawers, the card terminal's acquirer, each online provider's clearing
// balance (captured, not yet paid out) and the bank. Income and costs:
// sales, refunds against sales, provider fees.
export const LedgerAccounts = {
    CASH: "cash_drawer",
    CARD_TERMINAL: "card_terminal",
    providerClearing: (provider: string) => `provider_clearing:${provider.toUpperCase()}`,
    BANK: "bank",
    SALES: "sales",
    SALES_REFUNDS: "sales_refunds",
    PROVIDER_FEES: "provider_fees",
};

// The account a payment or refund moves money through
export function moneyAccount(method: string) {
    if (method === "CASH") return LedgerAccounts.CASH;
    if (method === "CARD_TERMINAL") return LedgerAccounts.CARD_TERMINAL;
    return LedgerAccounts.providerClearing(method);
}

export interface LedgerLine {
    type: LedgerEntryType;
    debitAccount: string;
    creditAccount: string;
    amount: number;   // minor units, what the pair should total
    currency: string;
    description?: string;
}

// Double-entry, append-only ledger (LedgerEntry). Entries are never edited
// or deleted: a correction is a new entry the other way.
export class LedgerService {

    // Posts one entry, once per idempotencyKey: a retry returns the entry
    // already posted.
    static async record(entry: {
        tenantUuid: string;
        storeUuid?: string | null;
        type: LedgerEntryType;
        amount: number;
        currency: string;
        debitAccount: string;
        creditAccount: string;
        refType: string;
        refUuid: string;
        idempotencyKey: string;
        description?: string;
        metadata?: Prisma.InputJsonValue;
        createdBy?: string;
    }, client: Client = prisma) {
        if (!Number.isInteger(entry.amount) || entry.amount <= 0) {
            throw new Error("INVALID_LEDGER_AMOUNT");
        }
        if (entry.debitAccount === entry.creditAccount) {
            throw new Error("INVALID_LEDGER_ACCOUNTS");
        }

        const existing = await client.ledgerEntry.findUnique({
            where: { idempotencyKey: entry.idempotencyKey },
        });
        if (existing) return existing;

        // A concurrent writer with the same key loses on the unique index
        return client.ledgerEntry.create({ data: entry });
    }

    // Brings what a source document (refType/refUuid, e.g. one store-day's
    // reconciliation) has posted into line with `lines`, so the ledger can
    // follow a document that's recomputed. For each account pair it posts
    // the difference between the target and what's already there: the
    // first posting as the line's type, later ones as ADJUSTMENT (the other
    // way when the target went down). A pair posted before but missing from
    // `lines` is brought back to zero. Unchanged pairs post nothing.
    //
    // Two syncs of the same document must not run at once; callers hold a
    // lock for it (the idempotency keys turn a race into an error, not a
    // double posting).
    static async syncDocument(tx: Prisma.TransactionClient, doc: {
        tenantUuid: string;
        storeUuid?: string | null;
        refType: string;
        refUuid: string;
        createdBy?: string;
    }, lines: LedgerLine[]) {
        const posted = await tx.ledgerEntry.findMany({
            where: { refType: doc.refType, refUuid: doc.refUuid },
            orderBy: { createdAt: "asc" },
        });

        // Orientation-free key for an account pair, per currency
        const pairKey = (a: string, b: string, currency: string) => [a, b].sort().join("|") + `|${currency}`;

        type Target = LedgerLine & { postedAmount: number; postedCount: number };
        const targets = new Map<string, Target>();
        for (const line of lines) {
            const key = pairKey(line.debitAccount, line.creditAccount, line.currency);
            const t = targets.get(key);
            if (t) t.amount += line.amount;
            else targets.set(key, { ...line, postedAmount: 0, postedCount: 0 });
        }
        for (const e of posted) {
            const key = pairKey(e.debitAccount, e.creditAccount, e.currency);
            let t = targets.get(key);
            if (!t) {
                // Posted before, gone now: its target is zero, in the
                // orientation it was first posted
                t = { type: e.type, debitAccount: e.debitAccount, creditAccount: e.creditAccount, amount: 0, currency: e.currency, postedAmount: 0, postedCount: 0 };
                targets.set(key, t);
            }
            t.postedAmount += e.debitAccount === t.debitAccount ? e.amount : -e.amount;
            t.postedCount++;
        }

        const created = [];
        for (const t of targets.values()) {
            const delta = t.amount - t.postedAmount;
            if (delta === 0) continue;
            const entry = await this.record({
                tenantUuid: doc.tenantUuid,
                storeUuid: doc.storeUuid,
                type: t.postedCount === 0 ? t.type : "ADJUSTMENT",
                amount: Math.abs(delta),
                currency: t.currency,
                debitAccount: delta > 0 ? t.debitAccount : t.creditAccount,
                creditAccount: delta > 0 ? t.creditAccount : t.debitAccount,
                refType: doc.refType,
                refUuid: doc.refUuid,
                idempotencyKey: `${doc.refType}:${doc.refUuid}:${t.debitAccount}>${t.creditAccount}:${t.currency}:${t.postedCount}`,
                description: t.postedCount === 0 ? t.description : `Adjustment: ${t.description ?? t.type}`,
                createdBy: doc.createdBy,
            }, tx);
            created.push(entry);
        }

        if (created.length > 0) {
            logWithContext("info", "[Ledger] Document synced", {
                refType: doc.refType,
                refUuid: doc.refUuid,
                entries: created.length,
            });
        }
        return created;
    }

    // Balance of one account at a store: debits minus credits
    static async balance(input: { tenantUuid: string; storeUuid?: string; account: string; currency?: string }, client: Client = prisma) {
        const scope = {
            tenantUuid: input.tenantUuid,
            ...(input.storeUuid && { storeUuid: input.storeUuid }),
            ...(input.currency && { currency: input.currency }),
        };
        const [debits, credits] = await Promise.all([
            client.ledgerEntry.aggregate({ where: { ...scope, debitAccount: input.account }, _sum: { amount: true } }),
            client.ledgerEntry.aggregate({ where: { ...scope, creditAccount: input.account }, _sum: { amount: true } }),
        ]);
        return (debits._sum.amount ?? 0) - (credits._sum.amount ?? 0);
    }
};
