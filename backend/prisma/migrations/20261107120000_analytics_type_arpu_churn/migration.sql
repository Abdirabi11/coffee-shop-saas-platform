-- AlterEnum: platform-wide ARPU/LTV and churn snapshots (arpuLtv.job, churnAnalytics.job)
ALTER TYPE "AnalyticsType" ADD VALUE IF NOT EXISTS 'ARPU_LTV';
ALTER TYPE "AnalyticsType" ADD VALUE IF NOT EXISTS 'CHURN';
