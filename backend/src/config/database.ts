import mysql, { Pool, PoolOptions } from 'mysql2/promise';
import { env } from './env';
import { logger } from '../utils/logger';

let pool: Pool | null = null;

const poolConfig: PoolOptions = {
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  connectionLimit: env.DB_POOL_SIZE,
  waitForConnections: true,
  queueLimit: 0,
  // Prevents stale connections from silently failing after idle timeout
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  // Named placeholders make parameterized queries more readable (and resist SQL injection)
  namedPlaceholders: true,
};

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool(poolConfig);
    logger.info('MySQL connection pool created', {
      host: env.DB_HOST,
      database: env.DB_NAME,
      poolSize: env.DB_POOL_SIZE,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('MySQL connection pool closed');
  }
}

// Health check used by /health endpoint and ECS container health checks
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const [rows] = await getPool().execute('SELECT 1 AS ok');
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}
