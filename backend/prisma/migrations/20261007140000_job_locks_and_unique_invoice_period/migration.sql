-- CreateTable
CREATE TABLE "JobLock" (
    "jobName" TEXT NOT NULL,
    "lockToken" TEXT NOT NULL,
    "lockedBy" TEXT NOT NULL,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JobLock_pkey" PRIMARY KEY ("jobName")
);

-- CreateIndex
-- Fails if duplicate period invoices already exist. Find them first with:
--   SELECT "tenantUuid", "subscriptionUuid", "type", "periodStart", count(*)
--   FROM "Invoice" WHERE "periodStart" IS NOT NULL
--   GROUP BY 1, 2, 3, 4 HAVING count(*) > 1;
CREATE UNIQUE INDEX "Invoice_tenantUuid_subscriptionUuid_type_periodStart_key" ON "Invoice"("tenantUuid", "subscriptionUuid", "type", "periodStart");
