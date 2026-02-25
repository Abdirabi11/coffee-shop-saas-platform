import prisma from "../../config/prisma.ts"

export class FeatureFlagService{
    //Check if feature is enabled for tenant
    static async isEnabled(
        tenantUuid: string,
        feature: string
    ): Promise<boolean> {
        const flag= await prisma.featureFlag.findFirst({
            where: {
                tenantUuid,
                key: feature,
                isEnabled: true,
            }
        });

        return !!flag;
    }
}