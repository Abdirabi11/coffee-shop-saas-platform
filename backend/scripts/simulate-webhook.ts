// LOCAL STRIPE WEBHOOK SIMULATOR
// Sends a signed payment_intent.succeeded event for an existing STRIPE
// payment to the local webhook endpoint, then prints the resulting payment,
// order and WebhookEvent ledger rows.
//
// The server and this script must share STRIPE_WEBHOOK_SECRET (any value
// works locally, e.g. whsec_local_test). Run from backend/:
//
//   npx tsx scripts/simulate-webhook.ts --payment <paymentUuid>
//   npx tsx scripts/simulate-webhook.ts --payment <uuid> --replay          # same event twice → 2nd is a duplicate
//   npx tsx scripts/simulate-webhook.ts --payment <uuid> --concurrent 5    # same event 5x in parallel → processed once
//   npx tsx scripts/simulate-webhook.ts --payment <uuid> --amount 1        # amount mismatch → flagged, not PAID
//   npx tsx scripts/simulate-webhook.ts --payment <uuid> --currency eur    # currency mismatch → flagged, not PAID
//
// Other flags: --event-id <id> (reuse an id across runs), --url <endpoint>.
// Note: webhookRateLimit applies, so large --concurrent values may see 429s.
import "dotenv/config";
import crypto from "node:crypto";
import prisma from "../src/config/prisma.ts";

const DEFAULT_URL = `http://localhost:${process.env.PORT || 5004}/api/payments/webhooks/stripe`;

interface Options {
    paymentUuid: string;
    url: string;
    replay: boolean;
    concurrent: number;
    amount?: number;
    currency?: string;
    eventId?: string;
}

function parseArgs(argv: string[]): Options {
    const get = (flag: string) => {
        const i = argv.indexOf(flag);
        return i >= 0 ? argv[i + 1] : undefined;
    };

    const paymentUuid = get("--payment");
    if (!paymentUuid) {
        console.error("Usage: npx tsx scripts/simulate-webhook.ts --payment <paymentUuid> [--replay] [--concurrent N] [--amount cents] [--currency xxx] [--event-id id] [--url url]");
        process.exit(1);
    }

    const amount = get("--amount");
    return {
        paymentUuid,
        url: get("--url") ?? DEFAULT_URL,
        replay: argv.includes("--replay"),
        concurrent: Math.max(1, Number(get("--concurrent") ?? 1)),
        amount: amount !== undefined ? Number(amount) : undefined,
        currency: get("--currency"),
        eventId: get("--event-id"),
    };
}

// Same scheme Stripe uses and stripe.webhooks.constructEvent verifies:
// header "t=<unix>,v1=<hex HMAC-SHA256 of `${t}.${payload}`>"
function signStripePayload(payload: string, secret: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
        .createHmac("sha256", secret)
        .update(`${timestamp}.${payload}`, "utf8")
        .digest("hex");
    return `t=${timestamp},v1=${signature}`;
}

async function send(url: string, payload: string, secret: string, label: string) {
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Stripe-Signature": signStripePayload(payload, secret),
            "User-Agent": "Stripe/1.0 (+https://stripe.com/docs/webhooks) simulate-webhook",
        },
        body: payload,
    });
    const body = await res.text();
    console.log(`  [${label}] HTTP ${res.status} ${body}`);
    return res.status;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));

    // Local only: this signs with the real secret and reads the database
    const target = new URL(opts.url);
    if (!["localhost", "127.0.0.1", "::1"].includes(target.hostname)) {
        throw new Error(`Refusing to send to non-local host ${target.hostname}`);
    }

    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
        throw new Error("STRIPE_WEBHOOK_SECRET is not set (the server must use the same value)");
    }

    const payment = await prisma.payment.findUnique({
        where: { uuid: opts.paymentUuid },
        select: {
            uuid: true, orderUuid: true, tenantUuid: true, storeUuid: true,
            provider: true, providerRef: true, amount: true, currency: true, status: true,
        },
    });
    if (!payment) throw new Error(`Payment ${opts.paymentUuid} not found`);
    if (payment.provider !== "STRIPE") throw new Error(`Payment provider is ${payment.provider}, expected STRIPE`);

    // No providerRef yet = placeholder whose Stripe call never stored one;
    // the webhook should still match it via metadata.paymentUuid.
    const intentId = payment.providerRef ?? `pi_sim_${crypto.randomBytes(8).toString("hex")}`;
    const eventId = opts.eventId ?? `evt_sim_${crypto.randomBytes(8).toString("hex")}`;
    const amountReceived = opts.amount ?? payment.amount;
    const currency = (opts.currency ?? payment.currency).toLowerCase();

    const event = {
        id: eventId,
        object: "event",
        api_version: "2023-10-16",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        type: "payment_intent.succeeded",
        data: {
            object: {
                id: intentId,
                object: "payment_intent",
                amount: payment.amount,
                amount_received: amountReceived,
                currency,
                status: "succeeded",
                metadata: {
                    paymentUuid: payment.uuid,
                    orderUuid: payment.orderUuid,
                    tenantUuid: payment.tenantUuid,
                    storeUuid: payment.storeUuid,
                },
            },
        },
    };
    const payload = JSON.stringify(event);

    console.log(`Payment ${payment.uuid} (status ${payment.status}, ${payment.amount} ${payment.currency})`);
    console.log(`Sending ${event.type} ${eventId} for ${intentId}${payment.providerRef ? "" : " (no providerRef: placeholder path)"}`);
    console.log(`  amount_received=${amountReceived} currency=${currency} → ${opts.url}`);

    if (opts.concurrent > 1) {
        await Promise.all(
            Array.from({ length: opts.concurrent }, (_, i) => send(opts.url, payload, secret, `parallel #${i + 1}`))
        );
    } else {
        await send(opts.url, payload, secret, "first");
        if (opts.replay) await send(opts.url, payload, secret, "replay");
    }

    const [after, order, ledger] = await Promise.all([
        prisma.payment.findUnique({
            where: { uuid: payment.uuid },
            select: { status: true, providerRef: true, paidAt: true, flaggedForReview: true, flagReason: true },
        }),
        prisma.order.findUnique({
            where: { uuid: payment.orderUuid },
            select: { status: true, paymentStatus: true },
        }),
        prisma.webhookEvent.findUnique({
            where: { provider_providerEventId: { provider: "STRIPE", providerEventId: eventId } },
            select: { status: true, retryCount: true, processingError: true, resultActions: true },
        }),
    ]);

    console.log("\nResult");
    console.log("  payment:", JSON.stringify(after));
    console.log("  order:  ", JSON.stringify(order));
    console.log("  ledger: ", JSON.stringify(ledger));
}

main()
    .catch((error) => {
        console.error(`simulate-webhook failed: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
