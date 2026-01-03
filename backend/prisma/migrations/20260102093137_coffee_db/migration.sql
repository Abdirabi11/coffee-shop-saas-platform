/*
  Warnings:

  - You are about to drop the column `price` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `Store` table. All the data in the column will be lost.
  - You are about to drop the column `planName` on the `Subscription` table. All the data in the column will be lost.
  - You are about to drop the `_StoreToTenant` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `interval` to the `Plan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Plan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `currentPeriodEnd` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `currentPeriodStart` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `planUuid` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `planVersionUuid` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `role` on the `UserStore` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "StoreRole" AS ENUM ('ADMIN', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "SubscriptionEvent" AS ENUM ('CREATED', 'MIGRATED', 'CANCELED', 'REACTIVATED');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'FAILED');

-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE 'PAUSED';

-- DropForeignKey
ALTER TABLE "_StoreToTenant" DROP CONSTRAINT "_StoreToTenant_A_fkey";

-- DropForeignKey
ALTER TABLE "_StoreToTenant" DROP CONSTRAINT "_StoreToTenant_B_fkey";

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Plan" DROP COLUMN "price",
ADD COLUMN     "interval" "BillingInterval" NOT NULL,
ADD COLUMN     "maxOrdersMonth" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Store" DROP COLUMN "isActive";

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "planName",
ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "currentPeriodStart" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "planUuid" TEXT NOT NULL,
ADD COLUMN     "planVersionUuid" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "UserStore" DROP COLUMN "role",
ADD COLUMN     "role" "StoreRole" NOT NULL;

-- DropTable
DROP TABLE "_StoreToTenant";

-- CreateTable
CREATE TABLE "TenantAddOn" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "addOnUuid" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "TenantAddOn_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "SubscriptionHistory" (
    "uuid" TEXT NOT NULL,
    "subscriptionUuid" TEXT NOT NULL,
    "event" "SubscriptionEvent" NOT NULL,
    "oldPlanVersionUuid" TEXT,
    "newPlanVersionUuid" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionHistory_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "BillingSnapshot" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "subscriptionUuid" TEXT NOT NULL,
    "planVersionUuid" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "baseAmount" INTEGER NOT NULL,
    "addonsAmount" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingSnapshot_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "PlanPricingVariant" (
    "uuid" TEXT NOT NULL,
    "planUuid" TEXT NOT NULL,
    "priceMonthly" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PlanPricingVariant_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "PlanVersion" (
    "uuid" TEXT NOT NULL,
    "planUuid" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "priceMonthly" INTEGER NOT NULL,
    "features" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PlanVersion_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "subscriptionUuid" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "InvoiceStatus" NOT NULL,
    "billingPeriod" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "provider" TEXT,
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "AnalyticsSnapshot" (
    "uuid" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "AddOn" (
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceMonthly" INTEGER NOT NULL,
    "metric" TEXT NOT NULL,

    CONSTRAINT "AddOn_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "EnterpriseContract" (
    "uuid" TEXT NOT NULL,
    "tenantUuid" TEXT NOT NULL,
    "priceMonthly" INTEGER NOT NULL,
    "customLimits" JSONB NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "EnterpriseContract_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "uuid" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyText" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "rollout" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "BrandingSetting" (
    "uuid" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "appName" TEXT NOT NULL,
    "supportEmail" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandingSetting_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingSnapshot_tenantUuid_month_key" ON "BillingSnapshot"("tenantUuid", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PlanVersion_planUuid_version_key" ON "PlanVersion"("planUuid", "version");

-- CreateIndex
CREATE INDEX "Invoice_tenantUuid_idx" ON "Invoice"("tenantUuid");

-- CreateIndex
CREATE INDEX "Invoice_subscriptionUuid_idx" ON "Invoice"("subscriptionUuid");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_paidAt_idx" ON "Invoice"("paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantUuid_billingPeriod_key" ON "Invoice"("tenantUuid", "billingPeriod");

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_type_period_idx" ON "AnalyticsSnapshot"("type", "period");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_key_key" ON "EmailTemplate"("key");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Store_createdAt_idx" ON "Store"("createdAt");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_startDate_idx" ON "Subscription"("startDate");

-- CreateIndex
CREATE INDEX "Subscription_endDate_idx" ON "Subscription"("endDate");

-- CreateIndex
CREATE INDEX "Tenant_createdAt_idx" ON "Tenant"("createdAt");

-- CreateIndex
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");

-- AddForeignKey
ALTER TABLE "TenantAddOn" ADD CONSTRAINT "TenantAddOn_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantAddOn" ADD CONSTRAINT "TenantAddOn_addOnUuid_fkey" FOREIGN KEY ("addOnUuid") REFERENCES "AddOn"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planUuid_fkey" FOREIGN KEY ("planUuid") REFERENCES "Plan"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planVersionUuid_fkey" FOREIGN KEY ("planVersionUuid") REFERENCES "PlanVersion"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionHistory" ADD CONSTRAINT "SubscriptionHistory_subscriptionUuid_fkey" FOREIGN KEY ("subscriptionUuid") REFERENCES "Subscription"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSnapshot" ADD CONSTRAINT "BillingSnapshot_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSnapshot" ADD CONSTRAINT "BillingSnapshot_subscriptionUuid_fkey" FOREIGN KEY ("subscriptionUuid") REFERENCES "Subscription"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSnapshot" ADD CONSTRAINT "BillingSnapshot_planVersionUuid_fkey" FOREIGN KEY ("planVersionUuid") REFERENCES "PlanVersion"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanPricingVariant" ADD CONSTRAINT "PlanPricingVariant_planUuid_fkey" FOREIGN KEY ("planUuid") REFERENCES "Plan"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_planUuid_fkey" FOREIGN KEY ("planUuid") REFERENCES "Plan"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionUuid_fkey" FOREIGN KEY ("subscriptionUuid") REFERENCES "Subscription"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnterpriseContract" ADD CONSTRAINT "EnterpriseContract_tenantUuid_fkey" FOREIGN KEY ("tenantUuid") REFERENCES "Tenant"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
