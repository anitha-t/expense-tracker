import 'express-async-errors'; // Patches Express to forward async throws to error handler
import path from 'path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { v4 as uuidv4 } from 'uuid';
import { env } from './config/env';
import { globalRateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import expenseRoutes from './modules/expenses/expense.routes';
import receiptRoutes from './modules/expenses/receipt.routes';
import authRoutes from './modules/auth/auth.routes';
import { checkDatabaseHealth } from './config/database';
import { checkRedisHealth } from './config/redis';
import { logger } from './utils/logger';

const app = express();

// Security headers (OWASP A05) — helmet sets HSTS, CSP, X-Frame-Options, etc.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
}));

// CORS — explicit origin whitelist, not wildcard
const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
}));

app.use(compression());
app.use(express.json({ limit: '10kb' }));
app.use(globalRateLimiter);

// Stamp every request with a correlation ID for log tracing
app.use((req, _res, next) => {
  req.requestId = (req.headers['x-request-id'] as string) ?? uuidv4();
  next();
});

// HTTP access log
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      msg: 'HTTP',
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
      requestId: req.requestId,
    });
  });
  next();
});

// Serve uploaded receipts as static files — before API routes
app.use('/uploads', express.static(path.resolve('uploads')));

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/expenses', expenseRoutes);
app.use('/api/v1/expenses/receipts', receiptRoutes);

// Health check — used by ECS/ALB target group and Kubernetes liveness probes
app.get('/health', async (_req, res) => {
  const [db, redis] = await Promise.all([checkDatabaseHealth(), checkRedisHealth()]);
  const status = db && redis ? 'ok' : 'degraded';
  res.status(db && redis ? 200 : 503).json({ status, db: db ? 'ok' : 'down', redis: redis ? 'ok' : 'down' });
});

// 404 handler — before the error handler, after all routes
app.use((_req, res) => res.status(404).json({ error: { message: 'Route not found' } }));

app.use(errorHandler);

export default app;
