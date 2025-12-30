/*
  Warnings:

  - You are about to drop the column `refreshTokenId` on the `Session` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[refreshTokenUuid]` on the table `Session` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `refreshTokenUuid` to the `Session` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_refreshTokenId_fkey";

-- DropIndex
DROP INDEX "Session_refreshTokenId_key";

-- AlterTable
ALTER TABLE "Session" DROP COLUMN "refreshTokenId",
ADD COLUMN     "refreshTokenUuid" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshTokenUuid_key" ON "Session"("refreshTokenUuid");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_refreshTokenUuid_fkey" FOREIGN KEY ("refreshTokenUuid") REFERENCES "RefreshToken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
