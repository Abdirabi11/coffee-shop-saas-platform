// LOCAL TEST PAYMENT SEED
// Creates (or reuses) a test user, tenant, tenant membership and store, then
// a new PENDING order with a PENDING STRIPE payment that has no providerRef:
// the placeholder state PaymentService.startPayment leaves before Stripe
// answers. Prints the payment UUID for scripts/simulate-webhook.ts.
//
//   npx tsx scripts/seed-test-payment.ts            # 1250 cents (USD 12.50)
//   npx tsx scripts/seed-test-payment.ts 4200       # custom amount in cents
//
// Safe to re-run: each run adds one order + payment. Local databases only.
import "dotenv/config";
import crypto from "node:crypto";
import prisma from "../src/config/prisma.ts";

const TEST_PHONE = "+10000000001";
const TEST_TENANT_SLUG = "sim-test-tenant";
const TEST_STORE_SLUG = "sim-test-store";

async function main() {
    const dbHost = new URL(process.env.DATABASE_URL ?? "postgresql://unset").hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(dbHost)) {
        throw new Error(`Refusing to seed non-local database host "${dbHost}"`);
    }

    const amount = Number(process.argv[2] ?? 1250);
    if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error("Amount must be a positive integer number of cents");
    }

    const user = await prisma.user.upsert({
        where: { phoneNumber: TEST_PHONE },
        update: {},
        create: { phoneNumber: TEST_PHONE, firstName: "Sim", lastName: "Customer" },
    });

    const tenant = await prisma.tenant.upsert({
        where: { slug: TEST_TENANT_SLUG },
        update: {},
        create: {
            name: "Simulation Coffee Co",
            slug: TEST_TENANT_SLUG,
            email: "sim-tenant@example.test",
            ownerUuid: user.uuid,
        },
    });

    const tenantUser =
        (await prisma.tenantUser.findFirst({ where: { tenantUuid: tenant.uuid, userUuid: user.uuid } })) ??
        (await prisma.tenantUser.create({
            data: { tenantUuid: tenant.uuid, userUuid: user.uuid, slug: "sim-customer" },
        }));

    const store =
        (await prisma.store.findFirst({ where: { tenantUuid: tenant.uuid, slug: TEST_STORE_SLUG } })) ??
        (await prisma.store.create({
            data: {
                tenantUuid: tenant.uuid,
                name: "Simulation Store",
                slug: TEST_STORE_SLUG,
                city: "Mogadishu",
            },
        }));

    const orderNumber = `SIM-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;

    const { order, payment } = await prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
            data: {
                tenantUuid: tenant.uuid,
                storeUuid: store.uuid,
                tenantUserUuid: tenantUser.uuid,
                orderNumber,
                status: "PENDING",
                paymentStatus: "PENDING",
                currency: "USD",
                subtotal: amount,
                totalAmount: amount,
                menuVersion: 1,
                pricingSnapshot: { items: [], calculations: { subtotal: amount, total: amount } },
            },
        });

        // Mirrors the placeholder PaymentService.startPayment inserts before
        // calling Stripe: PENDING, no providerRef, no clientSecret
        const payment = await tx.payment.create({
            data: {
                orderUuid: order.uuid,
                tenantUuid: tenant.uuid,
                storeUuid: store.uuid,
                amount,
                currency: "USD",
                subtotal: amount,
                tax: 0,
                paymentFlow: "PROVIDER",
                paymentMethod: "STRIPE",
                provider: "STRIPE",
                status: "PENDING",
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
                snapshot: {},
                orderSnapshot: { orderNumber, totalAmount: amount },
                pricingRules: { subtotal: amount, tax: 0, discount: 0 },
            },
        });

        return { order, payment };
    });

    console.log("Seeded test payment");
    console.log(`  tenant:  ${tenant.uuid} (${tenant.slug})`);
    console.log(`  store:   ${store.uuid}`);
    console.log(`  order:   ${order.uuid} (${order.orderNumber}, ${order.status})`);
    console.log(`  payment: ${payment.uuid} (${payment.status}, ${payment.amount} ${payment.currency}, providerRef=${payment.providerRef})`);
    console.log(`\nPAYMENT_UUID=${payment.uuid}`);
    console.log(`npx tsx scripts/simulate-webhook.ts --payment ${payment.uuid}`);
}

main()
    .catch((error) => {
        console.error(`seed-test-payment failed: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
