# Project Context: Multi-Tenant Coffee Shop SaaS Backend

## System Overview
This is a production-grade, multi-tenant POS and backend system for retail F&B operations (like a Starbucks-style chain). It handles multi-store onboarding, ordering, payments, staff scheduling, inventory, and platform-level SaaS billing.

## Tech Stack
- **Runtime:** Node.js, TypeScript (ESM targeted)
- **Framework:** Express 5
- **Database/ORM:** PostgreSQL via Prisma ORM 6 (180+ models)
- **Cache/Events:** Redis (ioredis preferred)
- **Validation:** Zod (legacy Joi should be refactored to Zod)
- **Payments:** Stripe, EVC+ (mobile money), Cash
- **Observability:** Pino (logging), Prom-client (metrics)

## Core Architectural Rules
1. **Strict Multi-Tenancy:** EVERY query and operation must be scoped to a `tenantUuid` and/or `storeUuid`. Never bypass the `requireTenantContext` or `ensureTenantIsolation` middlewares.
2. **Layered Architecture:** Follow the exact flow: `Routes -> Middlewares -> Controllers -> Services -> Prisma`.
3. **State Machines for Finance:** Payment processing, refunds, and cashier drawers MUST use explicit Finite State Machines (e.g., `PaymentStateMachine`). Do not use simple status string updates for financial transactions.
4. **Event-Driven Side Effects:** Keep core services fast. Emit events via the internal `eventBus` for side effects like cache invalidation, webhooks, sending emails, or fraud checks.
5. **Idempotency:** All critical financial and order-creation endpoints must utilize idempotency keys to prevent double-charging or duplicate orders.

## Current Tech Debt & Cleanup Priorities
- Ensure `server.ts` is the single source of truth. Ignore or delete `app.ts`.
- Ensure a global error handler is active and catches all unhandled exceptions, formatting them cleanly and logging via Pino.
- Standardize all validation to `Zod`.
- Remove dead code, commented-out logic blocks, and duplicate files (e.g., `* copy.ts`).