# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (`backend/`)
```bash
# Start dev server with hot reload
npm run dev

# Build TypeScript
npm run build

# Run all tests (must run serially — jest --runInBand)
npm test

# Unit tests only
npm run test:unit

# Integration tests only (requires MySQL + Redis running)
npm run test:integration

# Run a single test file
npx jest tests/unit/expense.service.test.ts

# Coverage report
npm run test:coverage
```

### Frontend (`frontend/`)
```bash
npm run dev          # Vite dev server (proxies /api/v1 → localhost:3001)
npm run build        # tsc + vite build
npm test             # Vitest (watch mode)
npm run test:ui      # Vitest with browser UI
npm run test:coverage
```

### Infrastructure
```bash
# Start MySQL + Redis locally (required for integration tests and dev)
docker compose up -d

# Seed the DB schema (runs automatically via Docker entrypoint on first start)
# To re-run manually:
docker exec -i expense-mysql mysql -uroot -ppassword expense_tracker < backend/migrations/001_init.sql
```

### Environment setup
```bash
cp backend/.env.example backend/.env
# Fill in: DB_PASSWORD, JWT_SECRET (min 32 chars)
# Use backend/.env.test for integration tests (separate DB recommended)
```

---

## Architecture

### Overview
Monorepo with two independent apps. No shared package — types are duplicated intentionally between `backend/src/types` and `frontend/src/types`.

```
backend/   Express + TypeScript REST API  →  MySQL (data) + Redis (cache/sessions)
frontend/  React + Vite SPA              →  talks only to /api/v1 (proxied in dev)
```

### Backend: Request Lifecycle

Every request follows: **Route → Middleware chain → Service → Repository**

```
auth.routes.ts / expense.routes.ts
  └── validate() middleware          — Zod schema parses req.body/req.query
  └── authenticate() middleware      — verifies JWT, stamps req.userId + req.userRole
  └── Service (ExpenseService, AuthService)
        └── Redis cache check        — short-circuits DB for reads
        └── Repository               — raw SQL via mysql2 named placeholders
```

- **`src/config/env.ts`** — single Zod-validated env object; app exits at startup if any variable is invalid. Import `env` from here, never `process.env` directly.
- **`src/middleware/errorHandler.ts`** — the only place that sends error responses. Throw `AppError(statusCode, message)` from anywhere; `express-async-errors` forwards it automatically. Zod errors are caught separately and return field-level details.
- **`src/middleware/validateRequest.ts`** — `validate({ body: Schema, query: Schema })` — replaces request body/query with the Zod-parsed value, so downstream code has typed, coerced data.
- **`src/middleware/auth.ts`** — `authenticate` verifies JWT and stamps `req.userId`/`req.userRole`. `requireRole(...roles)` is a separate guard used after `authenticate`.

### Auth Flow

```
POST /auth/login
  → bcrypt.compare (constant-time even on unknown email)
  → issues: accessToken (JWT, 1h) + refreshToken (UUID stored in Redis, 7d)

POST /auth/refresh
  → looks up refreshToken in Redis → rotates both tokens

POST /auth/logout
  → deletes refreshToken from Redis (JWT still valid until expiry — no blocklist)
```

Access tokens contain `{ sub: userId, role, jti }`. The `jti` field supports future token revocation via the `revoked:{jti}` Redis key pattern (wired in `auth.ts` but not yet written on logout).

### Expense Status Machine

```
draft → submitted → approved → reimbursed
              ↓
           rejected
```

- Only `draft` expenses can be edited or deleted.
- Submission requires `receiptUrl` to be set.
- Only `manager` or `admin` roles can approve/reject.
- `ExpenseService` enforces all transitions; `ExpenseRepository` writes raw status updates.

### Caching Strategy (Redis)

- `expense:{id}` — single expense, invalidated on any update.
- `expenses:{userId}:{JSON query}` — paginated list, invalidated on any change to that user's expenses.
- `refresh:{token}` — refresh token store (TTL = 7 days).
- `idempotent:expense:{key}` — 24h dedup for POST /expenses (client sends `X-Idempotency-Key` header).

Cache keys for lists use wildcard delete (`expenses:{userId}:*`) — this works with single-node Redis but requires a tag-based strategy for Redis Cluster.

### Repository Pattern

`ExpenseRepository` uses mysql2 named placeholders (`:paramName`) with the pool configured as `namedPlaceholders: true`. The `exec<T>()` private method wraps the single `as any` cast needed due to a known mysql2 TypeScript gap — all call sites above it are type-safe.

`LIMIT`/`OFFSET` in `findMany` are interpolated directly (not via named placeholders, which MySQL doesn't support for those clauses). Both values are validated integers from Zod before reaching the repository.

### Frontend: State and Data Flow

- **`authStore.ts`** (Zustand) — source of truth for `isAuthenticated` and `user`. Rehydrates from `localStorage` on page load by decoding the JWT payload client-side (no signature verification — trust is established server-side).
- **`services/api.ts`** — single axios instance. Request interceptor injects `Authorization: Bearer ...`. Response interceptor redirects to `/login` on 401.
- **TanStack Query** (`useExpenses.ts`) — manages all server state (fetching, caching, mutations). Components do not call `api.ts` directly; they use query/mutation hooks.
- **React Hook Form + Zod** — form validation uses the same Zod schemas as the API types imported from `@/types`.

### Database Schema

Three tables: `users`, `expenses`, `expense_audit_log`. Schema lives in `backend/migrations/001_init.sql` — currently applied manually/via Docker entrypoint. No migration runner is wired up yet (`npm run migrate` script exists but `src/config/migrate.ts` is a stub).

`amount` is `DECIMAL(12,2)` — never `FLOAT`.
