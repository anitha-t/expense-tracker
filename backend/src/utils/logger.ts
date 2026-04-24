import pino from 'pino';

// Compile-time guard: callers can only log this shape — no raw entity objects allowed.
// This is the primary defence; redact paths below are a last-resort safety net.
export type SafeLogContext = {
  userId?: string;       // ID only — never the full User object
  expenseId?: string;
  requestId?: string;
  durationMs?: number;
  statusCode?: number;
  method?: string;
  path?: string;
  error?: string;        // error.message only — never the full Error with a stack that leaks internals
  [key: string]: string | number | boolean | undefined;
};

// pino.redact uses fast-redact (compiled path matchers) — more reliable than
// manual object traversal because it handles nested paths, arrays, and runs once
// at startup rather than on every log call.
//
// Paths use dot-notation and wildcard syntax.
// This is the last-resort net; the SafeLogContext type above is the primary defence.
export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: [
      'password', 'passwordHash',
      'token', 'accessToken', 'refreshToken',
      'authorization', '*.authorization', 'headers.authorization',
      'creditCard', 'cardNumber', 'cvv', 'pan',
      'ssn', 'taxId',
      'secret', 'apiKey', 'privateKey',
      // Catch common aliased names
      'pwd', 'pass', 'passwd',
    ],
    censor: '[REDACTED]',
  },
  // In production, output raw JSON (parsed by CloudWatch / Datadog).
  // In dev, pretty-print for readability.
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  base: { service: 'expense-tracker-api', env: process.env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Serialize Error instances safely — message only in production to avoid
  // leaking internal stack traces to log aggregators accessible by more staff.
  serializers: {
    err: process.env.NODE_ENV === 'production'
      ? (err: Error) => ({ message: err.message, type: err.constructor.name })
      : pino.stdSerializers.err,
  },
});
