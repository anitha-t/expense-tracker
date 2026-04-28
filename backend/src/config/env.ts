import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),

  // Database — coerce strings to typed values at the edge so the rest of the
  // app works with proper types, not raw strings.
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().default(3306),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_POOL_SIZE: z.coerce.number().default(10),

  // Redis
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  REDIS_TTL_SECONDS: z.coerce.number().default(300),

  // Auth — enforce minimum secret length to prevent weak JWT secrets (OWASP A02)
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().min(10).default(12),

  // Rate limiting (OWASP A04 — rate limits prevent credential stuffing)
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  // CORS — explicit whitelist, not wildcard (OWASP A05)
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),

  // AWS (used by S3 for receipt uploads)
  AWS_REGION: z.string().default('us-east-1'),
  AWS_S3_BUCKET: z.string().optional(),

  // AI summary — set one of these. Groq is free; OpenAI requires billing.
  OPENAI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌  Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
