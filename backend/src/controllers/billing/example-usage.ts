// FREE Plan
const freePlan = await PlanService.createPlan({
  name: "Free",
  tier: "FREE",
  trialDays: 0,
  createdBy: "SYSTEM",
});

await PlanService.addPlanPrice({
  planUuid: freePlan.uuid,
  currency: "USD",
  interval: "MONTHLY",
  amount: 0,
  isDefault: true,
});

await PlanService.addPlanFeature({
  planUuid: freePlan.uuid,
  featureKey: "basic_pos",
  featureName: "Basic POS",
  type: "BOOLEAN",
  enabled: true,
});

await PlanService.addPlanQuota({
  planUuid: freePlan.uuid,
  quotaKey: "maxStores",
  quotaName: "Maximum Stores",
  limit: 1,
});

// PROFESSIONAL Plan
const proPlan = await PlanService.createPlan({
  name: "Professional",
  tier: "PROFESSIONAL",
  trialDays: 14,
  createdBy: "SYSTEM",
});

await PlanService.addPlanPrice({
  planUuid: proPlan.uuid,
  currency: "USD",
  interval: "MONTHLY",
  amount: 4900, // $49.00
  isDefault: true,
});

await PlanService.addPlanFeature({
  planUuid: proPlan.uuid,
  featureKey: "advanced_analytics",
  featureName: "Advanced Analytics",
  type: "BOOLEAN",
  enabled: true,
});

await PlanService.addPlanQuota({
  planUuid: proPlan.uuid,
  quotaKey: "maxStores",
  quotaName: "Maximum Stores",
  limit: 5,
});

await PlanService.addPlanQuota({
  planUuid: proPlan.uuid,
  quotaKey: "maxProducts",
  quotaName: "Maximum Products",
  limit: 1000,
});
