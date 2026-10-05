-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'EVC_PLUS';

-- AlterEnum
ALTER TYPE "WebhookProvider" ADD VALUE 'EVC_PLUS';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "clientOrderUuid" TEXT,
ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "syncSource" TEXT NOT NULL DEFAULT 'SERVER',
ADD COLUMN     "syncVersion" INTEGER NOT NULL DEFAULT 1;

-- DropEnum
DROP TYPE "AuditAction";

-- DropEnum
DROP TYPE "FunnelStep";

-- DropEnum
DROP TYPE "PaymentIntentStatus";

-- DropEnum
DROP TYPE "PaymentSnapshotStatus";

-- DropEnum
DROP TYPE "PermissionAction";

-- DropEnum
DROP TYPE "PermissionCategory";

-- DropEnum
DROP TYPE "Platform";

-- DropEnum
DROP TYPE "SubscriptionEvent";

-- DropEnum
DROP TYPE "WalletTransactionType";

-- DropEnum
DROP TYPE "WebhookDeliveryStatus";

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantUuid_clientOrderUuid_key" ON "Order"("tenantUuid", "clientOrderUuid");

