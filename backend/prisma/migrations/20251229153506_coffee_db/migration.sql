/*
  Warnings:

  - You are about to drop the `StoreStaff` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `storeUuid` to the `AuditLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storeUuid` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storeUuid` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `deviceFingerprint` to the `Session` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storeUuid` to the `Session` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantUuid` to the `Store` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "FraudSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- DropForeignKey
ALTER TABLE "StoreStaff" DROP CONSTRAINT "StoreStaff_storeUuid_fkey";

-- DropForeignKey
ALTER TABLE "StoreStaff" DROP CONSTRAINT "StoreStaff_userUuid_fkey";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "storeUuid" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "storeUuid" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "storeUuid" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "deviceFingerprint" TEXT NOT NULL,
ADD COLUMN     "storeUuid" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "tenantUuid" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "banReason" TEXT,
ADD COLUMN     "bannedAt" TIMESTAMP(3),
ADD COLUMN     "isBanned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tenantUuid" TEXT;

-- DropTable
DROP TABLE "StoreStaff";

-- CreateTable
CREATE TABLE "Tenant" (
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "ownerUuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "UserStore" (
    "userUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "role" "Role" NOT NULL,

    CONSTRAINT "UserStore_pkey" PRIMARY KEY ("userUuid","storeUuid")
);

-- CreateTable
CREATE TABLE "FraudEvent" (
    "uuid" TEXT NOT NULL,
    "userUuid" TEXT,
    "storeUuid" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "severity" "FraudSeverity" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FraudEvent_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "planName" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "stripeCustomerId" TEXT,
    "stripeSubId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Plan" (
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxStaff" INTEGER NOT NULL,
    "maxBranches" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "uuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "_StoreToTenant" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_StoreToTenant_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_ownerUuid_key" ON "Tenant"("ownerUuid");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_tenantUuid_key" ON "Subscription"("tenantUuid");

-- CreateIndex
CREATE INDEX "_StoreToTenant_B_index" ON "_StoreToTenant"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_ownerUuid_fkey" FOREIGN KEY ("ownerUuid") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStore" ADD CONSTRAINT "UserStore_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStore" ADD CONSTRAINT "UserStore_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudEvent" ADD CONSTRAINT "FraudEvent_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudEvent" ADD CONSTRAINT "FraudEvent_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StoreToTenant" ADD CONSTRAINT "_StoreToTenant_A_fkey" FOREIGN KEY ("A") REFERENCES "Store"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StoreToTenant" ADD CONSTRAINT "_StoreToTenant_B_fkey" FOREIGN KEY ("B") REFERENCES "Tenant"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
