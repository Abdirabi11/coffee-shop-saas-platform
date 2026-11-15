-- AlterTable
ALTER TABLE "IPWhitelist" ALTER COLUMN "ipAddress" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "receiptEmailQueuedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentDispute_provider_providerDisputeUuid_key" ON "PaymentDispute"("provider", "providerDisputeUuid");


-- A whitelist rule needs an address or a range (Prisma doesn't model CHECK
-- constraints; added by hand)
ALTER TABLE "IPWhitelist" ADD CONSTRAINT "IPWhitelist_address_or_range_check"
    CHECK ("ipAddress" IS NOT NULL OR "ipRange" IS NOT NULL);
