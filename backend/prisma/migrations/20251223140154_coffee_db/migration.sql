-- CreateTable
CREATE TABLE "LoginAttempt" (
    "uuid" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "otpCode" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE INDEX "LoginAttempt_phoneNumber_idx" ON "LoginAttempt"("phoneNumber");
