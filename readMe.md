# ☕ Coffee Shop SaaS Platform

A **production-ready, multi-tenant Coffee Shop SaaS platform** inspired by Starbucks-style systems.  
Designed to support **multiple coffee businesses (tenants)** with full role-based access, subscriptions, dashboards, and scalable backend architecture.

---

## 🚀 Features

### 🧑‍💼 Super Admin (Platform Owner)
- Global dashboard (revenue, tenants, subscriptions, risk)
- Tenant lifecycle management (activate, suspend, reactivate)
- Subscription & plan management
- Audit logs for all critical actions
- Redis-cached dashboards (Upstash)
- SaaS-wide analytics & observability

### 🏢 Tenant (Coffee Business)
- Multiple stores (branches)
- Tenant admin & staff roles
- Plan-based limits (users, stores)
- Subscription-aware access control

### ☕ Store Operations
- Product & menu management
- Orders lifecycle (pending → completed)
- Payments (Stripe-ready)
- Wallet & transaction support

### 🔐 Security & Architecture
- JWT authentication with refresh tokens
- Role-Based Access Control (RBAC)
- Tenant & store isolation
- Audit logging for sensitive actions
- Redis caching for high-performance dashboards
- Plan limit enforcement middleware

---

## 🧱 Tech Stack

### Backend
- **Node.js + Express**
- **TypeScript**
- **Prisma ORM**
- **PostgreSQL**
- **Upstash Redis**
- **Stripe (subscription-ready)**

### Architecture
- Multi-tenant SaaS
- Tenant-aware authorization
- Modular controllers & services
- Production-ready Prisma schema


📡 API Documentation
🔐 Authentication

All protected routes require a JWT access token.

Authorization: Bearer <access_token>


Authentication is handled using:

Access Token (short-lived)

Refresh Token (HTTP-only cookie)

Role-based & tenant-aware authorization middleware

👑 Super Admin API

Base path:

/api/super-admin

Dashboard
Method	Endpoint	Description
GET	/dashboard/overview	Revenue, tenants, orders snapshot
GET	/dashboard/revenue	Revenue analytics (time-series)
GET	/dashboard/tenants	Tenants list & stats
GET	/dashboard/tenant-health	Trial, past-due, near-limit tenants
GET	/dashboard/subscription-breakdown	Plans distribution
GET	/dashboard/risk	Abuse & platform risk metrics
Tenant Management
Method	Endpoint	Description
POST	/tenants	Create tenant
PATCH	/tenants/:uuid/suspend	Suspend tenant
PATCH	/tenants/:uuid/reactivate	Reactivate tenant
PATCH	/tenants/:uuid/subscription	Override subscription

All actions are audit logged.

🏢 Tenant Admin API

Base path:

/api/admin

Method	Endpoint	Description
POST	/stores	Create store
POST	/users	Invite staff
GET	/dashboard	Tenant dashboard
PATCH	/subscription	View subscription

Plan limits are enforced automatically.

☕ Store & Customer API

Base path:

/api`

Method	Endpoint	Description
GET	/products	List products
POST	/orders	Create order
GET	/orders/:uuid	Order status
POST	/payments/stripe	Pay with Stripe
GET	/wallet	Wallet balance
⚠️ Error Format
{
  "message": "Not authorized",
  "code": "AUTH_401"
}

🏗️ Architecture Overview
High-Level Design

This project follows a multi-tenant SaaS architecture with strict tenant isolation and role-based access control.

┌─────────────────────┐
│   Super Admin UI    │
└─────────┬───────────┘
          │
┌─────────▼───────────┐
│   API Gateway       │
│  (Express + JWT)    │
└─────────┬───────────┘
          │
┌─────────▼───────────┐
│ Authorization Layer │
│ RBAC + Tenant Guard │
└─────────┬───────────┘
          │
┌─────────▼───────────┐
│ Application Layer   │
│ Controllers/Services│
└─────────┬───────────┘
          │
┌─────────▼───────────┐
│ Data Layer          │
│ Prisma + PostgreSQL │
└─────────┬───────────┘
          │
┌─────────▼───────────┐
│ Redis (Upstash)     │
│ Caching & RateLimit │
└─────────────────────┘

Tenant Isolation Strategy

Every request is scoped by:

tenantUuid

optionally storeUuid

Super Admin bypasses tenant scope

Cross-tenant access is impossible by design

Subscription & Plan Flow
Stripe Payment
     ↓
Webhook Handler
     ↓
Subscription Status Update
     ↓
Tenant Status (ACTIVE / SUSPENDED)
     ↓
Plan Limits Enforcement

Audit & Observability

All Super Admin actions generate audit logs

Logs include:

Actor

Action

Target

IP & User Agent

Dashboard data is Redis-cached for performance

Scalability Considerations

Stateless API (horizontal scaling)

Redis for read-heavy workloads

Database-driven plan limits

Modular controllers for future microservices

🔚 Summary

This architecture is designed to scale from:

Single coffee shop → Multi-city SaaS platform

without rewriting core logic.

---

## 🗂️ Core Domain Models

- User (Super Admin, Admin, Manager, Staff, Customer)
- Tenant (Coffee business)
- Store (Branch)
- Subscription & Plan
- Order & Payment
- Wallet & Transactions
- Audit Logs

---

## 📊 Super Admin Dashboards

- Revenue overview
- Active / suspended tenants
- Subscription breakdown
- Tenant health (limits, trials, payment issues)
- Risk & abuse monitoring

All dashboards are **Redis-cached** for performance.

---

## 🔑 Authorization Model

- **SUPER_ADMIN** → Platform-wide control
- **ADMIN** → Tenant owner
- **MANAGER / STAFF** → Store-level access
- **CUSTOMER** → Ordering & wallet

Authorization is **tenant-aware** and **store-aware**.

---

## 🧪 Status

🚧 Actively developed  
- Stripe webhooks (in progress)
- Rate limiting & abuse protection
- Metrics & monitoring

---

## 📌 Goal

This project is built as a **real SaaS foundation**, not a tutorial:
- Clean architecture
- Scalable data model
- Enterprise-ready patterns

Perfect for **portfolio**, **startup MVP**, or **real-world SaaS learning**.

---

## 📄 License
MIT
