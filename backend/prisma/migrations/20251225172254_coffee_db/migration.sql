-- CreateTable
CREATE TABLE "Admin2FA" (
    "uuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Admin2FA_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Store" (
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "StoreStaff" (
    "uuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "storeUuid" TEXT NOT NULL,
    "role" "Role" NOT NULL,

    CONSTRAINT "StoreStaff_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin2FA_userUuid_key" ON "Admin2FA"("userUuid");

-- AddForeignKey
ALTER TABLE "Admin2FA" ADD CONSTRAINT "Admin2FA_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreStaff" ADD CONSTRAINT "StoreStaff_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreStaff" ADD CONSTRAINT "StoreStaff_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
