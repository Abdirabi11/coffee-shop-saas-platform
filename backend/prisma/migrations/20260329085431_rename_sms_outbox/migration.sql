/*
  Warnings:

  - You are about to drop the `SMSOutbox` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "SMSOutbox";

-- CreateTable
CREATE TABLE "SmsOutbox" (
    "uuid" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsOutbox_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE INDEX "SmsOutbox_status_createdAt_idx" ON "SmsOutbox"("status", "createdAt");
