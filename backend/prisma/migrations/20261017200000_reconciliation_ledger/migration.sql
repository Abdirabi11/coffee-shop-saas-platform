-- Provider payouts in the ledger
ALTER TYPE "LedgerEntryType" ADD VALUE 'PAYOUT';

-- One ledger posting per idempotency key
ALTER TABLE "LedgerEntry" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "LedgerEntry_idempotencyKey_key" ON "LedgerEntry"("idempotencyKey");

-- Daily reconciliation: store-local day window and gross/refund/fee/net split
ALTER TABLE "DailyReconciliation"
    ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC',
    ADD COLUMN "periodStart" TIMESTAMP(3),
    ADD COLUMN "periodEnd" TIMESTAMP(3),
    ADD COLUMN "onlineDeclared" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "grossCollected" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "refundsTotal" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "cashRefunds" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "cardRefunds" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "onlineRefunds" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "providerFees" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "netCollected" INTEGER NOT NULL DEFAULT 0;

-- Provider reconciliation: fees kept apart from the variance
ALTER TABLE "PaymentReconciliation"
    ADD COLUMN "providerFeeTotal" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "expectedNetTotal" INTEGER NOT NULL DEFAULT 0;
