-- AlterEnum: platform-wide monthly revenue snapshots (monthlyRevenue.job)
ALTER TYPE "AnalyticsType" ADD VALUE IF NOT EXISTS 'MONTHLY_REVENUE';
