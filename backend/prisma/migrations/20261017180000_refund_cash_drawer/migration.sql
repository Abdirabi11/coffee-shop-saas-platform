-- Cash refunds record the drawer the cash was paid out of
-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "cashDrawerUuid" TEXT;

-- CreateIndex
CREATE INDEX "Refund_cashDrawerUuid_idx" ON "Refund"("cashDrawerUuid");

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_cashDrawerUuid_fkey" FOREIGN KEY ("cashDrawerUuid") REFERENCES "CashDrawer"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
