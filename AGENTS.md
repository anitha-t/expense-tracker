# AGENTS.md — Expense Tracker Agent Reference & Context Guide

> **Purpose**: Authoritative context file for AI coding agents (Antigravity, Cursor, Claude Code, Copilot, etc.).
> Consult this document first to avoid redundant directory searches and file re-reads across turns.

---

## 1. Project Overview & Quick Reference

- **Domain**: Corporate Travel & Expense (T&E) management application.
- **Repository Structure**: Monorepo with two independent TypeScript apps (`backend/` and `frontend/`). No shared npm workspace package; types are shared by design via explicit definitions in both apps.
- **Backend Stack**: Node.js 22+, Express 4, TypeScript 5, MySQL 8 (`mysql2/promise`), Redis 7 (`ioredis`), Zod 3, Pino (structured logs with fast-redact), Multer (file upload), OpenAI SDK (used with Groq or OpenAI for summaries).
- **Frontend Stack**: React 18, Vite 5, TypeScript 5, TanStack React Query v5, Zustand, React Hook Form, Zod, Axios, date-fns.
- **Infrastructure**: Docker Compose (`mysql:8.0`, `redis:7-alpine`).

### Essential CLI Commands

```bash
# Infrastructure (from repo root)
docker compose up -d                              # Starts MySQL (3306) & Redis (6379)
docker compose down                               # Stop containers

# Backend (cd backend)
npm run dev                                       # ts-node-dev hot reload on port 3001
npm run build                                     # Compile TypeScript (tsc)
npm start                                         # Run compiled dist/server.js
npm test                                          # Run all Jest tests serially (jest --runInBand)
npm run test:unit                                 # Unit tests only (no DB/Redis required)
npm run test:integration                          # Integration tests (requires MySQL + Redis)
npm run test:coverage                             # Jest coverage report
npx jest tests/unit/expense.service.test.ts       # Run specific test file

# Frontend (cd frontend)
npm run dev                                       # Vite dev server on port 3000 (proxies /api & /uploads -> 3001)
npm run build                                     # Typecheck + Vite production build
npm test                                          # Vitest watch mode (jsdom)
npm run test:ui                                   # Vitest with browser UI
npm run test:coverage                             # Vitest coverage report

# Database Schema & Migrations
# Initial schema: backend/migrations/001_init.sql (auto-mounted by docker-compose)
# Manual schema apply:
docker exec -i expense-mysql mysql -uroot -ppassword expense_tracker < backend/migrations/001_init.sql
```

---

## 2. Codebase Map & File Index

```
expense-tracker/
├── docker-compose.yml              # Local MySQL 8 & Redis 7 services
├── CLAUDE.md                       # Claude Code guidance
├── AGENTS.md                       # Universal agent instruction & context guide (this file)
├── backend/
│   ├── migrations/
│   │   └── 001_init.sql            # Schema: users, expenses, expense_audit_log
│   ├── src/
│   │   ├── server.ts               # Process entrypoint, port binding (3001), graceful shutdown
│   │   ├── app.ts                  # Express application setup, security middlewares, route mounting
│   │   ├── config/
│   │   │   ├── env.ts              # Zod-validated environment config (MUST import 'env' from here)
│   │   │   ├── database.ts         # MySQL pool (mysql2) + checkDatabaseHealth()
│   │   │   └── redis.ts            # Redis client (ioredis) + typed cache helpers + checkRedisHealth()
│   │   ├── middleware/
│   │   │   ├── auth.ts             # authenticate() (JWT + Redis revocation check) & requireRole() RBAC
│   │   │   ├── errorHandler.ts     # AppError class + global error handler (ZodError -> 400, AppError -> status)
│   │   │   ├── rateLimiter.ts      # globalRateLimiter, authRateLimiter, submissionRateLimiter
│   │   │   └── validateRequest.ts  # Zod schema validation middleware factory validate({ body, query, params })
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   │   ├── auth.routes.ts  # /register, /login, /refresh, /logout
│   │   │   │   ├── auth.service.ts # Password hashing, timing-safe login, token generation/rotation
│   │   │   │   └── auth.types.ts   # Zod schemas & TypeScript types for auth
│   │   │   └── expenses/
│   │   │       ├── expense.controller.ts # Request/response serialization
│   │   │       ├── expense.service.ts    # Business logic, state machine, cache invalidation, AI summary
│   │   │       ├── expense.repository.ts # Raw SQL queries with mysql2 named placeholders
│   │   │       ├── expense.routes.ts     # REST endpoints for /api/v1/expenses
│   │   │       ├── receipt.routes.ts     # POST /api/v1/expenses/receipts (multer disk upload)
│   │   │       └── expense.types.ts      # Expense schemas, DB row shapes, domain models
│   │   └── utils/
│   │       └── logger.ts           # Pino structured logger with sensitive data redaction
│   ├── tests/
│   │   ├── unit/expense.service.test.ts          # Mocked repo/Redis business logic unit tests
│   │   └── integration/expense.routes.test.ts    # Supertest full request-response integration tests
│   └── uploads/                    # Local storage directory for uploaded receipts (served at /uploads)
└── frontend/
    ├── vite.config.ts              # Vite config, test runner config (jsdom), path alias '@' -> './src'
    └── src/
        ├── main.tsx                # React DOM root render
        ├── App.tsx                 # React Router setup, QueryClientProvider, Private/Public routes
        ├── types/index.ts          # Shared frontend interfaces (Expense, ExpenseStatus, UserRole, etc.)
        ├── services/api.ts         # Axios instance, Bearer token interceptor, 401 redirect, API methods
        ├── store/authStore.ts      # Zustand auth store with lightweight client-side JWT decoder
        ├── hooks/useExpenses.ts    # React Query hooks (useExpenses, useCreateExpense, useApproveExpense, etc.)
        ├── components/
        │   ├── ExpenseForm.tsx     # react-hook-form + Zod validation + ReceiptUpload controller
        │   ├── ExpenseList.tsx     # Role-based action buttons (Submit, Delete, Approve, Reject)
        │   ├── ReceiptUpload.tsx   # Drag-and-drop receipt uploader with progress and preview
        │   └── StatusBadge.tsx     # Visual status indicators with color mapping
        ├── pages/
        │   ├── DashboardPage.tsx   # Main expense management dashboard
        │   ├── LoginPage.tsx       # User sign-in
        │   └── RegisterPage.tsx    # User registration
        └── tests/
            ├── setup.ts            # MSW server lifecycle + Jest DOM matchers
            ├── mocks/handlers.ts   # Mock Service Worker HTTP request handlers
            ├── api.test.ts         # Axios interceptors unit tests
            ├── ExpenseForm.test.tsx# Form validation tests
            └── createExpense.test.tsx # Create expense integration test
```

---

## 3. Architecture & Data Flow Patterns

### Request Lifecycle
```
Client Request
  ↓
Express app (app.ts): Helmet → CORS → Compression → express.json(10kb) → RateLimiter → RequestId stamp → Pino log
  ↓
Route Layer: validate({ body, query, params }) parses & coerces data via Zod
  ↓
Auth Guard: authenticate() verifies Bearer JWT + checks Redis revoked:{jti} list → attaches req.userId & req.userRole
  ↓ (Optional)
RBAC Guard: requireRole('manager', 'admin') verifies permission
  ↓
Controller: unmarshals typed inputs, delegates to Service
  ↓
Service Layer: business logic (status validation, RBAC, idempotency, Redis caching)
  ↓
Repository Layer: parameterized SQL via mysql2 named placeholders
  ↓
Response / Error Handler: AppError formatted as { error: { message, code }, requestId }
```

### Express Process Separation (`app.ts` vs `server.ts`)
- **`app.ts`**: Configures middleware, static files (`/uploads`), API routes, health checks, and error handling. Exported without calling `.listen()`.
- **`server.ts`**: Binds port `env.PORT` (3001) and handles graceful shutdown (`SIGTERM`, `SIGINT`) closing MySQL pool and Redis client.
- **Why?** Allows integration tests (`supertest(app)`) to run against the app in-memory without listening on network ports.

---

## 4. Domain Rules & Expense Lifecycle

### State Machine
```
[ draft ] ──(submit)──> [ submitted ] ──(approve)──> [ approved ] ──> [ reimbursed ]
                              │
                         (reject)
                              ↓
                         [ rejected ]
```

### Business Rules & Constraints
1. **Status Editing**: Only `draft` expenses can be edited (`PATCH`) or deleted (`DELETE`).
2. **Submission Constraint**: An expense CANNOT be submitted without a valid `receiptUrl` set.
3. **Approval Permissions**: Only users with role `'manager'` or `'admin'` can approve or reject expenses. Employees cannot approve their own or other users' expenses.
4. **Rejection Reason**: When rejecting an expense, `rejectionReason` (min 10 characters) is mandatory.
5. **Money Precision**: `amount` is stored as `DECIMAL(12, 2)` in MySQL. Never use `FLOAT` or JavaScript floating-point arithmetic for currency calculation.
6. **Limit Cap**: Single expense amount is capped at `1,000,000` via Zod schema validation.
7. **Idempotency**: Clients can pass `idempotencyKey` (UUID). Stored in Redis as `idempotent:expense:{key}` with a 24-hour TTL (`SET key 1 EX 86400 NX`). Duplicate requests reject with `409 Conflict`.

---

## 5. Database Schema & Query Guidelines

### Schema Summary (`backend/migrations/001_init.sql`)
- **`users`**:
  - `id CHAR(36) PRIMARY KEY` (UUIDv4)
  - `email VARCHAR(255) UNIQUE`
  - `password_hash VARCHAR(255)` (bcrypt cost 12)
  - `name VARCHAR(100)`
  - `role ENUM('employee', 'manager', 'admin') DEFAULT 'employee'`
  - `is_active BOOLEAN DEFAULT TRUE`
- **`expenses`**:
  - `id CHAR(36) PRIMARY KEY` (UUIDv4)
  - `user_id CHAR(36) FK -> users(id)`
  - `amount DECIMAL(12,2) CHECK (amount > 0)`
  - `currency CHAR(3) DEFAULT 'USD'`
  - `category ENUM('travel','accommodation','meals','transportation','office_supplies','software','training','other')`
  - `description VARCHAR(500)`
  - `receipt_url VARCHAR(2048) NULL`
  - `status ENUM('draft','submitted','approved','rejected','reimbursed') DEFAULT 'draft'`
  - `submitted_at DATETIME NULL`
  - `approved_by CHAR(36) NULL FK -> users(id)`
  - `approved_at DATETIME NULL`
  - `rejection_reason VARCHAR(1000) NULL`
- **`expense_audit_log`**:
  - `id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY`
  - `expense_id CHAR(36)`, `actor_id CHAR(36)`, `action VARCHAR(50)`, `old_status`, `new_status`, `metadata JSON`, `created_at DATETIME`

### MySQL Query Rules & Known Gotchas
> [!CAUTION]
> **MySQL `LIMIT` / `OFFSET` Placeholder Bug**:
> MySQL's prepared statement protocol throws `"Incorrect arguments to mysqld_stmt_execute"` if named placeholders (`:limit`, `:offset`) are bound for `LIMIT` or `OFFSET`.
> They MUST be string-interpolated directly in `ExpenseRepository.findMany`:
> ```typescript
> `SELECT * FROM expenses WHERE ... LIMIT ${query.limit} OFFSET ${offset}`
> ```
> This is secure ONLY because `query.limit` and `query.page` are validated integers coerced by Zod (`min 1, max 100`).

- **mysql2 Type Casting**: The private method `ExpenseRepository.exec<T>()` wraps `this.pool.execute<T>(sql, params as any)`. Do NOT alter this cast; it resolves a known TypeScript defect in mysql2 where `ExecuteValues` omits `Record<string, unknown>`.

---

## 6. Caching & Redis Key Schema

| Key Pattern | Data Stored | TTL | Invalidation Trigger |
|---|---|---|---|
| `expense:{id}` | Single `Expense` object | Indefinite | On update, delete, submit, approve, reject |
| `expenses:{userId}:{queryJSON}` | Paginated list result | 60 sec | On any mutation by this `userId` (`expenses:${userId}:*` wildcard delete) |
| `refresh:{refreshToken}` | `{ userId, role }` | 7 days | On token refresh or user logout |
| `idempotent:expense:{key}` | Flag `'1'` | 24 hours | Automatic expiry |
| `weekly-summary:{userId}` | `{ summary, data }` | 1 hour | Automatic expiry |
| `revoked:{jti}` | `true` | JWT lifetime | On token revocation |

---

## 7. API Specification Matrix

| Method | Endpoint | Auth / Roles | Body / Query | Description |
|---|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Public | `{ email, password, name, role }` | Creates user, returns `{ accessToken, refreshToken, expiresIn }` |
| `POST` | `/api/v1/auth/login` | Public | `{ email, password }` | Authenticates with constant-time compare; returns tokens |
| `POST` | `/api/v1/auth/refresh` | Public | `{ refreshToken }` | Rotates both access & refresh tokens |
| `POST` | `/api/v1/auth/logout` | Authenticated | `{ refreshToken }` | Revokes refresh token in Redis (204 No Content) |
| `GET` | `/api/v1/expenses` | Authenticated | Query: `page`, `limit`, `status`, `category`, `from`, `to` | List expenses (employees see own; managers see all) |
| `GET` | `/api/v1/expenses/:id` | Authenticated | Params: `id` (UUID) | Get single expense |
| `POST` | `/api/v1/expenses` | Authenticated | `{ amount, currency, category, description, receiptUrl?, idempotencyKey? }` | Create expense draft |
| `PATCH` | `/api/v1/expenses/:id` | Authenticated | Partial create payload | Update draft expense |
| `POST` | `/api/v1/expenses/:id/submit`| Authenticated | None | Submit draft for approval (requires `receiptUrl`) |
| `POST` | `/api/v1/expenses/:id/approve`| `manager`, `admin` | `{ action: 'approve' \| 'reject', rejectionReason? }` | Approve or reject expense |
| `DELETE`| `/api/v1/expenses/:id` | Authenticated | None | Delete draft expense (204 No Content) |
| `GET` | `/api/v1/expenses/summary/weekly`| Authenticated | None | AI-generated summary of past 7 days spending |
| `POST` | `/api/v1/expenses/receipts` | Authenticated | `multipart/form-data` (field: `receipt`) | Upload JPEG/PNG/WebP/PDF (max 10MB) -> `{ url }` |
| `GET` | `/health` | Public | None | Health status for DB & Redis |

> [!IMPORTANT]
> **Route Order in `expense.routes.ts`**:
> The route `router.get('/summary/weekly', ...)` MUST be defined BEFORE `router.get('/:id', ...)` to prevent Express from treating the string `'summary'` as a UUID parameter.

---

## 8. Frontend Patterns & Guidelines

1. **State Management**:
   - Client Auth State: `useAuthStore` (Zustand). Stores `user` (`{ userId, role }`) and `isAuthenticated`. Decodes JWT payload client-side via `atob` without external libraries.
   - Server State: TanStack React Query (`useExpenses`, `useCreateExpense`, etc.). All mutations automatically call `queryClient.invalidateQueries({ queryKey: ['expenses'] })`.
2. **API Communication**:
   - Single Axios client (`frontend/src/services/api.ts`).
   - Request interceptor injects `Authorization: Bearer <accessToken>` from `localStorage`.
   - Response interceptor catches `401`, clears storage, and redirects to `/login`.
3. **Form Handling**:
   - `react-hook-form` connected to Zod schemas via `@hookform/resolvers/zod`.
   - `ReceiptUpload`: Renders drop zone when idle, progress bar during upload, and file preview/link when completed.
4. **Vite Proxy**:
   - Dev proxy routes `/api` and `/uploads` to `http://localhost:3001`. In production, reverse proxy / ingress handles this path routing.

---

## 9. Security Implementation Checklist

| Protection | Implementation Detail | Location |
|---|---|---|
| Input Validation | Strict Zod validation on body, query, and params; rejects extra fields | `validateRequest.ts` |
| SQL Injection | Parameterized queries with named placeholders everywhere | `expense.repository.ts` |
| Timing Attacks | Constant-time `bcrypt.compare` with dummy hash on missing user | `auth.service.ts` |
| Password Security | bcrypt minimum 12 salt rounds | `auth.service.ts` |
| Token Security | Short-lived JWT (1h) + Redis refresh token rotation (7d) | `auth.service.ts` |
| Security Headers | Helmet CSP, HSTS, X-Frame-Options | `app.ts` |
| Rate Limiting | Global (100/15m), Auth (10/15m), Submissions (30/1m) | `rateLimiter.ts` |
| File Uploads | MIME type whitelist + 10MB limit + UUID filenames | `receipt.routes.ts` |
| PII Redaction | Pino structured logging with fast-redact for passwords & tokens | `logger.ts` |

---

## 10. AI Coding Agent Rules & Anti-Patterns to Avoid

- **DO NOT** import `process.env` directly in backend code. Always import `env` from `src/config/env`.
- **DO NOT** execute integration tests with concurrency (`npm test` uses `--runInBand` because tests touch shared database tables).
- **DO NOT** mutate `expense.status` directly outside `ExpenseService`. The repository merely executes SQL; all validation and state transitions belong in the service layer.
- **DO NOT** use floating point numbers for financial calculation.
- **DO NOT** define Express routes with dynamic parameters before static sub-paths (`/:id` before `/summary/weekly`).
- **DO NOT** sign test JWTs with hardcoded secrets. Import `env.JWT_SECRET` from `src/config/env` because `env.ts` parses variables once at module load.
