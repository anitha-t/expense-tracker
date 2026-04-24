import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

// Global limiter: protects all endpoints from general abuse.
// Headers (X-RateLimit-*) are returned so clients can back off gracefully.
export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Generic message — don't tell attackers exactly how many attempts remain
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) => req.ip === '127.0.0.1' && env.NODE_ENV === 'test',
});

// Strict limiter for auth endpoints — 10 attempts per 15 minutes.
// Prevents credential stuffing (OWASP A07) and brute-force attacks.
// This is applied only on POST /auth/login and POST /auth/register.
export const authRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again in 15 minutes.' },
  skip: (req) => req.ip === '127.0.0.1' && env.NODE_ENV === 'test',
});

// Submission limiter — prevents duplicate expense submissions from mobile retry loops.
// Kept intentionally generous (30/minute) since legitimate users batch-submit receipts.
export const submissionRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Submission rate limit exceeded.' },
});
