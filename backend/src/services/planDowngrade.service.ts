import prisma from "../config/prisma.ts"

export const validatePlanDowngrade= async (
    tenantUuid: string,
    targetPlanVersionUuid: string
)=>{
    const targetPlan= await prisma.planVersion.findUnique({
        where: {uuid: targetPlanVersionUuid}
    });
    if (!targetPlan) {
        throw new Error("Target plan not found");
    };

    const staffCount= await prisma.userStore.count({
        where: { storeUuid: tenantUuid },
    });
    
    const productCount= await prisma.product.count({
        where: {storeUuid: tenantUuid}
    });

    const limits= targetPlan.features as {
        maxStaff?: number;
        maxProducts?: number;
    };

    const violations: string[]= []

    if(limits.maxStaff && staffCount > limits.maxStaff){
        violations.push(
            `Staff count (${staffCount}) exceeds plan limit (${limits.maxStaff})`
        );
    };

    if(limits.maxProducts && productCount > limits.maxProducts){
        violations.push(
            `Product count (${productCount}) exceeds plan limit (${limits.maxProducts})`
        );
    };

    return {
        allowed: violations.length === 0,
        violations,
    };
}