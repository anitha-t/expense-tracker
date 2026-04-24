import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, {
      // Retry with exponential backoff — don't hammer Redis on restart
      retryStrategy: (times) => {
        if (times > 10) {
          logger.error('Redis: max retries reached, giving up');
          return null;
        }
        return Math.min(times * 100, 3000);
      },
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    redisClient.on('connect', () => logger.info('Redis connected'));
    redisClient.on('error', (err) => logger.error('Redis error', { error: err.message }));
    redisClient.on('close', () => logger.warn('Redis connection closed'));
  }
  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

// Typed cache helpers — callers never touch raw strings
export async function cacheGet<T>(key: string): Promise<T | null> {
  const value = await getRedisClient().get(key);
  if (!value) return null;
  return JSON.parse(value) as T;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = env.REDIS_TTL_SECONDS): Promise<void> {
  await getRedisClient().setex(key, ttlSeconds, JSON.stringify(value));
}

export async function cacheDelete(key: string): Promise<void> {
  await getRedisClient().del(key);
}

// Used for idempotency — returns true if the key was newly set (first-time request)
export async function setIdempotencyKey(key: string, ttlSeconds = 86400): Promise<boolean> {
  const result = await getRedisClient().set(key, '1', 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}

export async function checkRedisHealth(): Promise<boolean> {
  try {
    const pong = await getRedisClient().ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
