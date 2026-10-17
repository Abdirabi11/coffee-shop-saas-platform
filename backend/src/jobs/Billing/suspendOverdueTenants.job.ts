import prisma from "../../config/prisma.ts"
import { billingEnforcementEnabled } from "./billingEnforcement.ts";
import dayjs from "dayjs";
import { EventBus } from "../../events/eventBus.ts";

export async function suspendOverdueTenants() {
    // Off until platform invoices can be paid: see billingEnforcement.ts
    if (!billingEnforcementEnabled("suspendOverdueTenants")) return 0;

    console.log("🚫 Suspending overdue tenants");
    // Find tenants with overdue invoices
    const overdueInvoices = await prisma.invoice.findMany({
        where: {
            status: "OVERDUE",
            tenant: {
            status: "ACTIVE",
            },
        },
        include: {
            tenant: true,
        },
    });
    // Group by tenant and check grace period
    const tenantsToSuspend = new Map<string, any>();
    
    for (const invoice of overdueInvoices) {
      const daysOverdue = dayjs().diff(dayjs(invoice.dueDate), "days");
      
      // Suspend if more than 7 days overdue
        if (daysOverdue > 7) {
            tenantsToSuspend.set(invoice.tenantUuid, invoice.tenant);
        }
    }
  
    let suspended = 0;
  
    for (const [tenantUuid, tenant] of tenantsToSuspend) {
        try {
            await prisma.tenant.update({
            where: { uuid: tenantUuid },
            data: {
                status: "SUSPENDED",
                suspendedAt: new Date(),
                suspendedReason: "Overdue payment",
            },
            });
    
            // Also suspend subscriptions
            await prisma.subscription.updateMany({
            where: { tenantUuid },
            data: { status: "UNPAID" },
            });
    
            // Live screens of the tenant stop streaming (DashboardSocket)
            EventBus.emit("TENANT_STATUS_CHANGED", { tenantUuid, status: "SUSPENDED" });

            suspended++;
        } catch (error: any) {
            console.error(`Failed to suspend tenant ${tenantUuid}:`, error.message);
        }
    }
    console.log(`✅ Suspended ${suspended} tenants`);
    return suspended;
};