# Expense Tracker — Session Notes

## Project Structure

```
expense-tracker/
├── backend/                        # Node.js + TypeScript + Express
│   ├── src/
│   │   ├── config/
│   │   │   ├── env.ts              # Zod-validated env vars — crash on startup if missing
│   │   │   ├── database.ts         # MySQL connection pool
│   │   │   └── redis.ts            # Redis client + typed cache helpers
│   │   ├── middleware/
│   │   │   ├── auth.ts             # JWT verification + RBAC guard
│   │   │   ├── rateLimiter.ts      # Global + strict auth limiters
│   │   │   ├── errorHandler.ts     # AppError class + global error serializer
│   │   │   └── validateRequest.ts  # Zod middleware factory
│   │   ├── modules/
│   │   │   ├── auth/               # Register, login, refresh, logout
│   │   │   └── expenses/           # Full CRUD + submit + approve workflow
│   │   ├── utils/logger.ts         # pino structured logger with redact
│   │   ├── app.ts                  # Express app (helmet, cors, routes)
│   │   └── server.ts               # Process startup + graceful shutdown
│   ├── migrations/001_init.sql     # Schema: users, expenses, audit_log
│   └── tests/
│       ├── unit/expense.service.test.ts
│       └── integration/expense.routes.test.ts
├── frontend/                       # React + TypeScript + Vite
│   ├── src/
│   │   ├── types/index.ts          # Shared domain types
│   │   ├── services/api.ts         # Axios instance + interceptors
│   │   ├── store/authStore.ts      # Zustand auth state
│   │   ├── hooks/useExpenses.ts    # React Query custom hooks
│   │   ├── components/
│   │   │   ├── ExpenseForm.tsx     # react-hook-form + Zod validation
│   │   │   ├── ExpenseList.tsx     # Role-aware action buttons
│   │   │   └── StatusBadge.tsx     # Status colour map
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── RegisterPage.tsx
│   │   │   └── DashboardPage.tsx
│   │   └── tests/
│   │       ├── setup.ts            # MSW + jest-dom + localStorage mock
│   │       ├── mocks/              # MSW handlers + server
│   │       ├── api.test.ts         # Axios interceptor + network layer
│   │       ├── ExpenseForm.test.tsx
│   │       └── createExpense.test.tsx
└── docker-compose.yml              # MySQL 8 + Redis 7
```

---

## Architecture Decisions

### Why this domain?
Built a Travel & Expense tracker because many finance domains need this. Every design decision has a real business justification

### Backend: Monorepo with separate `app.ts` and `server.ts`
- `app.ts` — Express configuration, routes, middleware
- `server.ts` — process binding, graceful shutdown, signal handling

**Why split?** Integration tests import `app` directly via `supertest` without binding a real port. If startup code lived in `app.ts`, tests would try to connect to MySQL/Redis on import.

### Repository → Service → Controller pattern
- **Repository**: all SQL, returns domain objects
- **Service**: business rules (status transitions, RBAC, idempotency)
- **Controller**: extract request → call service → send response (no logic)

**Why?** Unit testing the service means mocking the repository — no database needed, tests run in milliseconds. If MySQL is replaced with Postgres, only the repository changes.

### UUID primary keys (not auto-increment integers)
Auto-increment IDs expose record counts and allow enumeration attacks (`GET /expenses/1`, `/expenses/2`...). UUIDs prevent this (OWASP A01).

---

## Security Decisions (OWASP / PCI-DSS / GDPR)

| Area | Decision | Standard |
|---|---|---|
| Input validation | Zod schema on every route, rejects unknown fields | OWASP A03 |
| SQL injection | Named placeholders on all queries — never string concatenation | OWASP A03 |
| Auth tokens | Short-lived JWT (1h) + refresh token in Redis with TTL | OWASP A07 |
| Password hashing | bcrypt with minimum cost factor 12 | OWASP A07 |
| Timing attacks | Always call `bcrypt.compare` even when user not found | OWASP A07 |
| Rate limiting | Strict 10 req/15min on `/login` and `/register` | OWASP A04 |
| Security headers | `helmet` — sets HSTS, CSP, X-Frame-Options in one line | OWASP A05 |
| Error responses | Stack traces logged internally, opaque message to client | OWASP A05 |
| Logging PII | `pino` built-in `redact` with compiled path matchers | GDPR |
| Money storage | `DECIMAL(12,2)` — never `FLOAT` (binary rounding = penny errors) | PCI-DSS |
| Audit trail | Append-only `expense_audit_log` table | PCI-DSS |

### Why `pino` over `winston` for logging?
The original `winston` implementation used a custom recursive field scrubber — it could miss aliased field names (`pwd`, `tok`) and didn't handle arrays. `pino` uses `fast-redact` — compiled path matchers run once at startup, not on every log call. Combined with a `SafeLogContext` TypeScript type, sensitive data is blocked at two layers: compile time (type checker) and runtime (pino redact).

### Timing attack on login
```typescript
// WRONG — attacker can tell if email exists by response time
if (!user) return res.status(401).json({ error: 'Invalid credentials' });
const valid = await bcrypt.compare(input.password, user.password_hash);

// CORRECT — always call bcrypt.compare regardless
const dummyHash = '$2b$12$invalidhashpaddingtomatchlengthXXXXXXXXXXXX';
const valid = user
  ? await bcrypt.compare(input.password, user.password_hash)
  : await bcrypt.compare(input.password, dummyHash).then(() => false);
```

---

## Key TypeScript Patterns

### Zod as single source of truth
Zod schemas generate both the runtime validator AND the TypeScript type via `z.infer<>`. No type/validator divergence.

```typescript
export const CreateExpenseSchema = z.object({ ... });
export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>; // type is derived
```

### Module augmentation for typed request properties
```typescript
declare global {
  namespace Express {
    interface Request {
      userId: string;
      userRole: 'employee' | 'manager' | 'admin';
      requestId: string;
    }
  }
}
```
Controllers never cast `(req as any).userId`. The compiler enforces the shape.

### `ZodTypeAny` vs `AnyZodObject` in middleware
```typescript
// WRONG — rejects schemas that use .refine() (returns ZodEffects, not ZodObject)
interface RequestSchemas { body?: AnyZodObject; }

// CORRECT — accepts plain schemas AND refined/transformed schemas
interface RequestSchemas { body?: ZodTypeAny; }
```

### mysql2 named placeholders type workaround
mysql2's TypeScript types don't expose `Record<string, unknown>` as valid `ExecuteValues` for named placeholders even though the runtime supports it when `namedPlaceholders: true` is set. Solution: one private wrapper method with a single `as any` cast — all call sites stay clean.

```typescript
private exec<T extends RowDataPacket[] | ResultSetHeader>(sql: string, params?: Record<string, unknown>) {
  return this.pool.execute<T>(sql, params as any); // one cast, isolated here
}
```

### LIMIT/OFFSET cannot use named placeholders in MySQL
MySQL's prepared statement protocol doesn't support named placeholders for `LIMIT`/`OFFSET`. They must be interpolated directly. Safe because both are validated integers from Zod (`min(1).max(100)`).

```typescript
// WRONG — runtime error: "Incorrect arguments to mysqld_stmt_execute"
`SELECT * FROM expenses WHERE ... LIMIT :limit OFFSET :offset`

// CORRECT — safe interpolation (Zod guarantees integer bounds)
`SELECT * FROM expenses WHERE ... LIMIT ${query.limit} OFFSET ${offset}`
```

---

## Frontend Decisions

### Vite over Create React App
- 10–50x faster HMR
- Native TypeScript support
- Vite proxy eliminates CORS in development

### Zustand over Redux for auth state
No actions/reducers/dispatch for a two-field auth slice. Zustand's minimal API:
```typescript
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  login: (token) => { localStorage.setItem('accessToken', token); set({ user: decode(token) }); },
  logout: () => { localStorage.clear(); set({ user: null }); },
}));
```

### JWT decoded client-side without a library
```typescript
function decodeToken(token: string) {
  const payload = token.split('.')[1];
  return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
}
```
Avoids a dependency. Gets `userId` and `role` from the token — no separate `/me` API call needed on page load.

### React Query for server state
Replaces manual `useEffect` + `useState` fetch chains. `invalidateQueries` on mutation success auto-refetches the list — no manual state updates.

### Single axios instance with two interceptors
```typescript
// Request: inject auth header once — controllers never touch tokens
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response: global 401 handler — redirect to login on token expiry
http.interceptors.response.use(res => res, err => {
  if (err.response?.status === 401) window.location.href = '/login';
  return Promise.reject(err);
});
```

### Vite dev proxy mirrors production
```typescript
proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } }
```
In production, an ALB or Nginx rule does the same. The browser never talks directly to the backend port, so CORS headers aren't needed locally.

---

## Testing Strategy

### Backend: Two frameworks, two purposes
| Framework | What it tests | Why |
|---|---|---|
| Jest + mocked repo | Business logic in the service | No DB needed, runs in milliseconds |
| Jest + supertest | Full request/response cycle | Catches middleware ordering bugs |

### Frontend: Vitest + Testing Library + MSW
| Layer | Test file | What it covers |
|---|---|---|
| Network | `api.test.ts` | axios interceptors, auth header injection, error handling |
| Component | `ExpenseForm.test.tsx` | Zod validation, form submission, error display |
| Integration | `createExpense.test.tsx` | Full create flow, RBAC, server error display |

**Why MSW (Mock Service Worker)?** Intercepts `axios` at the network level — tests the actual interceptors, not a mocked axios instance. `onUnhandledRequest: 'warn'` flags any API call missing a handler, which surfaces missing routes early.

### JWT secret mismatch bug (integration tests)
`env.ts` parses all env vars into an immutable object at module load time. Setting `process.env.JWT_SECRET` after import doesn't update `env.JWT_SECRET`. Integration tests must use `env.JWT_SECRET` to sign tokens — not a hardcoded string.

```typescript
// WRONG — token signed with test secret, verified against .env secret = 401
const TEST_SECRET = 'test-secret';
process.env.JWT_SECRET = TEST_SECRET; // too late — env.ts already loaded
const token = jwt.sign({ sub: userId }, TEST_SECRET);

// CORRECT
import { env } from '../../src/config/env';
const token = jwt.sign({ sub: userId }, env.JWT_SECRET);
```

---

## Bugs Found by Tests (and fixes)

| Bug | Layer | Root Cause | Fix |
|---|---|---|---|
| Labels not linked to inputs | `ExpenseForm` | Missing `htmlFor`/`id` — broke accessibility AND autofill | Added `id` + `htmlFor` on every input |
| `receiptUrl` error message swallowed | `ExpenseForm` | `z.string().url().optional().or(z.literal(''))` union hides the specific error | `z.preprocess('' → undefined, z.string().url().optional())` |
| Server error not shown in form | `DashboardPage` | `mutateAsync` throws on 400, no try/catch → unhandled rejection | Added try/catch; error stays in `createMutation.error` |
| Dashboard tests: `selector is not a function` | `createExpense.test` | `useAuthStore()` called with no selector, but mock always expected one | Mock returns full state when `selector` is undefined |
| Test expected server error for amount 2000000 | `createExpense.test` | Client-side Zod `max(1_000_000)` blocked submission before reaching MSW | Changed test amount to 500 (within client limit) |
| List endpoint 500 in production | `expense.repository` | MySQL `LIMIT :limit OFFSET :offset` named placeholders not supported | Interpolated validated integers directly into SQL |
| Route not found on submit | All | `$EXPENSE_ID` env var not set in new terminal session | Must re-export `EXPENSE_ID` after restarting shell |

---

## How to Run

### Prerequisites
- Docker (for MySQL + Redis)
- Node.js 22+

### Backend
```bash
cd expense-tracker

# Start MySQL and Redis
docker compose up -d

# Install and start
cd backend
npm install
npm run dev          # http://localhost:3001

# Run tests
npm test
```

### Frontend
```bash
cd expense-tracker/frontend
npm install
npm run dev          # http://localhost:3000

# Run tests
npm test
```

### Key API endpoints
```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/logout

GET    /api/v1/expenses              # list (paginated)
POST   /api/v1/expenses              # create (employee)
PATCH  /api/v1/expenses/:id          # update draft
POST   /api/v1/expenses/:id/submit   # submit for approval
POST   /api/v1/expenses/:id/approve  # approve or reject (manager/admin)
DELETE /api/v1/expenses/:id          # delete draft

GET    /health                       # DB + Redis health check
```
> Added Summary API to integrate using GROQ API
- Connect to DB and uses GroQ API LLMs to return the summary of expenses for the week.

> Added in UI to upload a receipt and gave directions to fix the button state.

> Further Improvement can be done to use AWS S3 for uploads
> Write a helm to deploy to EKS