import prisma from "../../config/prisma.ts"

export class AccountService {
    //Lock account payments (highest risk level)
    static async lockPayments(input: {
        tenantUserUuid: string;
        reason: string;
        lockedBy?: string;
    }) {
        await prisma.tenantUser.update({
            where: { uuid: input.tenantUserUuid },
            data: {
                paymentLocked: true,
                paymentLockedReason: input.reason,
                paymentLockedAt: new Date(),
                paymentLockedBy: input.lockedBy || "SYSTEM",
            },
        });
  
      // Create admin alert
        const tenantUser = await prisma.tenantUser.findUnique({
            where: { uuid: input.tenantUserUuid },
            include: { tenant: true, user: true },
        });
  
        if (tenantUser) {
            await prisma.adminAlert.create({
                data: {
                    tenantUuid: tenantUser.tenantUuid,
                    alertType: "ACCOUNT_PAYMENT_LOCKED",
                    category: "SECURITY",
                    level: "CRITICAL",
                    priority: "HIGH",
                    title: "Account Payment Locked",
                    message: `Payment locked for user ${tenantUser.user.email}: ${input.reason}`,
                    context: {
                        tenantUserUuid: input.tenantUserUuid,
                        userEmail: tenantUser.user.email,
                        reason: input.reason,
                    },
                },
            });
        }
  
        console.log(`[AccountService] Payment locked: ${input.tenantUserUuid}`);
    }

    //Unlock account payments (manual admin action)
    static async unlockPayments(input: {
        tenantUserUuid: string;
        unlockedBy: string;
        notes?: string;
    }) {
        await prisma.tenantUser.update({
            where: { uuid: input.tenantUserUuid },
            data: {
                paymentLocked: false,
                paymentLockedReason: null,
                paymentLockedAt: null,
                paymentLockedBy: null,
            },
        });
  
        console.log(`[AccountService] Payment unlocked: ${input.tenantUserUuid} by ${input.unlockedBy}`);
    }

    static async isPaymentLocked(tenantUserUuid: string): Promise<boolean> {
        const tenantUser = await prisma.tenantUser.findUnique({
            where: { uuid: tenantUserUuid },
            select: { paymentLocked: true },
        });
  
        return tenantUser?.paymentLocked ?? false;
    }
}