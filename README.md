# Expense Tracker

A full-stack travel & expense management app. Employees submit expenses for approval; managers approve or reject them. Built as a sample project modelled on tools like Emburse.

## Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js · Express · TypeScript |
| **Frontend** | React 18 · Vite · TypeScript |
| **Database** | MySQL 8 |
| **Cache / Sessions** | Redis 7 |
| **Auth** | JWT (access token) + UUID refresh token stored in Redis |
| **Validation** | Zod (shared schema pattern on both sides) |
| **Frontend state** | Zustand (auth) · TanStack Query (server state) |
| **Forms** | React Hook Form + Zod resolvers |

## Getting Started

### 1. Start infrastructure

```bash
docker compose up -d
```

This starts MySQL on `3306` and Redis on `6379`. The schema (`backend/migrations/001_init.sql`) is applied automatically on first start.

### 2. Configure backend environment

```bash
cp backend/.env.example backend/.env
```

Fill in the two required fields:

```env
DB_PASSWORD=password        # matches docker-compose.yml
JWT_SECRET=<min 32 chars>   # any random string, e.g. openssl rand -hex 32
```

### 3. Install and run

**Backend** (runs on `http://localhost:3001`):
```bash
cd backend
npm install
npm run dev
```

**Frontend** (runs on `http://localhost:3000`, proxies `/api/v1` to the backend):
```bash
cd frontend
npm install
npm run dev
```

## API

All endpoints are under `/api/v1`. Protected routes require `Authorization: Bearer <accessToken>`.

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | — | Register; returns `{ accessToken, refreshToken }` |
| `POST` | `/auth/login` | — | Login; returns `{ accessToken, refreshToken }` |
| `POST` | `/auth/refresh` | — | Rotate tokens using `{ refreshToken }` |
| `POST` | `/auth/logout` | ✓ | Invalidates refresh token |

Auth endpoints are rate-limited independently (stricter than the global limit).

### Expenses

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/expenses/summary/weekly` | any | Natural-language spending summary for the past 7 days |
| `GET` | `/expenses` | any | List own expenses (paginated, filterable) |
| `POST` | `/expenses` | any | Create a draft expense |
| `GET` | `/expenses/:id` | any* | Get one expense |
| `PATCH` | `/expenses/:id` | any | Update a draft expense |
| `DELETE` | `/expenses/:id` | any | Delete a draft expense |
| `POST` | `/expenses/:id/submit` | any | Submit for approval (requires `receiptUrl`) |
| `POST` | `/expenses/:id/approve` | manager/admin | Approve or reject a submitted expense |

\* Employees see only their own; managers and admins see all.

**Query params for `GET /expenses`:** `status`, `category`, `from`, `to`, `page`, `limit`

**Idempotent creates:** send `X-Idempotency-Key: <uuid>` on `POST /expenses` to safely retry without creating duplicates.

### Expense status flow

```
draft ──► submitted ──► approved ──► reimbursed
                  └───► rejected
```

Only `draft` expenses can be edited or deleted. Submission requires a `receiptUrl`.

### Roles

| Role | Permissions |
|---|---|
| `employee` | Create, edit, submit, delete own expenses |
| `manager` | All of the above + approve/reject any submitted expense |
| `admin` | Same as manager |

## Development

### Running tests

**Backend:**
```bash
cd backend
npm test                          # all tests (unit + integration), must run serially
npm run test:unit                 # unit tests only (no DB/Redis needed)
npm run test:integration          # requires Docker services running
npm run test:coverage             # coverage report (thresholds: 80% lines/functions)
npx jest tests/unit/expense.service.test.ts   # single file
```

**Frontend:**
```bash
cd frontend
npm test              # Vitest in watch mode
npm run test:coverage
```

Integration tests use `supertest` against a real MySQL instance (configured via `backend/.env.test`). No mocking of the database layer.

### Project structure

```
backend/
  migrations/        SQL schema (applied by Docker on first start)
  src/
    config/          env validation, DB pool, Redis client
    middleware/      auth (JWT verify + RBAC), validation (Zod), rate limiter, error handler
    modules/
      auth/          register · login · refresh · logout
      expenses/      controller · service · repository · types/schemas
    utils/           pino logger
  tests/
    unit/            service-layer tests
    integration/     full HTTP route tests via supertest

frontend/
  src/
    pages/           LoginPage · RegisterPage · DashboardPage
    components/      ExpenseForm · ExpenseList · StatusBadge
    hooks/           useExpenses (TanStack Query)
    services/        api.ts — single axios instance with auth interceptors
    store/           authStore (Zustand) — persists tokens in localStorage
    types/           shared TypeScript interfaces
```

### Adding a new expense category

1. Add the value to the `ExpenseCategory` enum in `backend/src/modules/expenses/expense.types.ts`
2. Add it to the MySQL `ENUM` in a new migration file under `backend/migrations/`
3. Mirror it in `frontend/src/types/index.ts`

### Health check

```
GET /health
```

Returns `{ status: "ok" | "degraded", db: "ok" | "down", redis: "ok" | "down" }` — used by load balancer liveness probes.
