import Redis from 'ioredis';
import logger from './logger';

let client: Redis | null = null;
let redisDisabled = false;

export function getRedisClient(): Redis | null {
  if (redisDisabled) {
    return null;
  }

  if (process.env.REDIS_ENABLED === '0') {
    redisDisabled = true;
    logger.info('[Redis] 已关闭 (REDIS_ENABLED=0)');
    return null;
  }

  if (client) {
    return client;
  }

  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD;
  const db = parseInt(process.env.REDIS_DB || '0', 10);

  try {
    client = new Redis({ host, port, password, db });

    client.on('connect', () => {
      logger.info(`[Redis] 已连接 ${host}:${port}/${db}`);
    });

    client.on('error', (error: Error) => {
      logger.error(`[Redis] 连接错误: ${error.message}`);
    });

    client.on('end', () => {
      logger.warn('[Redis] 连接已关闭');
    });
  } catch (error: any) {
    logger.warn(`[Redis] 创建客户端失败: ${error.message}`);
    redisDisabled = true;
    client = null;
  }

  return client;
}

export function closeRedisClient(): void {
  if (client) {
    client.quit().catch(() => client?.disconnect());
    client = null;
  }
}
