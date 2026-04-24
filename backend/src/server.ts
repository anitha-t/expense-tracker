import app from './app';
import { env } from './config/env';
import { closePool } from './config/database';
import { closeRedis } from './config/redis';
import { logger } from './utils/logger';

const server = app.listen(env.PORT, () => {
  logger.info({ msg: `Server started`, port: env.PORT, env: env.NODE_ENV });
});

// Graceful shutdown — ECS sends SIGTERM before SIGKILL; Kubernetes terminationGracePeriodSeconds
// gives us time to drain in-flight requests before the container is killed.
async function shutdown(signal: string): Promise<void> {
  logger.info({ msg: `Received ${signal}, shutting down gracefully` });

  server.close(async () => {
    await Promise.all([closePool(), closeRedis()]);
    logger.info({ msg: 'Shutdown complete' });
    process.exit(0);
  });

  // Force kill after 30s if graceful shutdown stalls
  setTimeout(() => {
    logger.error({ msg: 'Forced shutdown after timeout' });
    process.exit(1);
  }, 30_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ msg: 'Unhandled rejection', error: String(reason) });
});
