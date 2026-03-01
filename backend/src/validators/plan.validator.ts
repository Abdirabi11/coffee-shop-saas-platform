import { z } from "zod";

export const createPlanSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().max(500).optional(),
  tier: z.enum(["FREE", "STARTER", "PROFESSIONAL", "ENTERPRISE"]),
  planType: z.enum(["SUBSCRIPTION", "ONE_TIME", "USAGE_BASED"]).optional(),
  trialDays: z.number().int().min(0).max(90).optional(),
  highlightedFeatures: z.array(z.string()).optional(),
});

export const updatePlanSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  description: z.string().max(500).optional(),
  tagline: z.string().max(200).optional(),
  highlightedFeatures: z.array(z.string()).optional(),
  badges: z.array(z.string()).optional(),
  ctaText: z.string().max(50).optional(),
  displayOrder: z.number().int().optional(),
});

export const addPlanPriceSchema = z.object({
  currency: z.string().length(3).default("USD"),
  interval: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]),
  amount: z.number().int().positive(),
  region: z.string().optional(),
  isDefault: z.boolean().optional(),
});

export const addPlanFeatureSchema = z.object({
  featureKey: z.string().min(2).max(100),
  featureName: z.string().min(3).max(200),
  description: z.string().max(500).optional(),
  type: z.enum(["BOOLEAN", "QUANTITY", "TEXT"]),
  enabled: z.boolean().optional(),
  quantity: z.number().int().positive().optional(),
  textValue: z.string().optional(),
  category: z.string().optional(),
  highlight: z.boolean().optional(),
});

export const addPlanQuotaSchema = z.object({
  quotaKey: z.string().min(2).max(100),
  quotaName: z.string().min(3).max(200),
  limit: z.number().int().positive(),
  limitType: z.enum(["HARD", "SOFT"]).optional(),
  softLimit: z.number().int().positive().optional(),
  allowOverage: z.boolean().optional(),
  overageFee: z.number().int().positive().optional(),
  resetInterval: z.enum(["DAILY", "MONTHLY", "YEARLY"]).optional(),
});