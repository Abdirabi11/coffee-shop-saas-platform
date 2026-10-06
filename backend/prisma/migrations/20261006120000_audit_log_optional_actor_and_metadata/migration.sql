-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_storeUuid_fkey";

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_actorUuid_fkey";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "metadata" JSONB,
ALTER COLUMN "storeUuid" DROP NOT NULL,
ALTER COLUMN "actorUuid" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_storeUuid_fkey" FOREIGN KEY ("storeUuid") REFERENCES "Store"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUuid_fkey" FOREIGN KEY ("actorUuid") REFERENCES "TenantUser"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

