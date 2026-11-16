-- AlterEnum: platform-wide cohort snapshots (cohortRetention.job, tenantCohortGrowth.job),
-- read by the super admin analytics endpoints
ALTER TYPE "AnalyticsType" ADD VALUE IF NOT EXISTS 'COHORT_RETENTION';
ALTER TYPE "AnalyticsType" ADD VALUE IF NOT EXISTS 'TENANT_COHORT_GROWTH';
