import Redis from 'ioredis';
import Queue from 'bull';
import { config } from './index';
import { logger } from './logger';

// Redis client for general use
export const redis = new Redis(config.redis.url, {
  password: config.redis.password,
  db: config.redis.db,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  keepAlive: 30000,
} as any);

// Redis client for Bull queue
export const queueRedis = new Redis(config.redis.url, {
  password: config.redis.password,
  db: config.redis.db + 1, // Use different DB for queues
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
} as any);

// Event handlers for Redis
redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('ready', () => {
  logger.info('Redis ready');
});

redis.on('error', (error) => {
  logger.error('Redis error', { error: error.message });
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

redis.on('reconnecting', () => {
  logger.info('Redis reconnecting');
});

// Queue Redis event handlers
queueRedis.on('connect', () => {
  logger.info('Queue Redis connected');
});

queueRedis.on('error', (error) => {
  logger.error('Queue Redis error', { error: error.message });
});

// Queue definitions
export const emailQueue = new Queue('email processing', {
  redis: {
    host: config.redis.url.includes('://') 
      ? new URL(config.redis.url).hostname 
      : config.redis.url,
    port: config.redis.url.includes('://') 
      ? parseInt(new URL(config.redis.url).port) || 6379
      : 6379,
    password: config.redis.password,
    db: config.redis.db + 1,
  },
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 100,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

export const auditQueue = new Queue('audit processing', {
  redis: {
    host: config.redis.url.includes('://') 
      ? new URL(config.redis.url).hostname 
      : config.redis.url,
    port: config.redis.url.includes('://') 
      ? parseInt(new URL(config.redis.url).port) || 6379
      : 6379,
    password: config.redis.password,
    db: config.redis.db + 1,
  },
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 5000,
    },
  },
});

export const fileProcessingQueue = new Queue('file processing', {
  redis: {
    host: config.redis.url.includes('://') 
      ? new URL(config.redis.url).hostname 
      : config.redis.url,
    port: config.redis.url.includes('://') 
      ? parseInt(new URL(config.redis.url).port) || 6379
      : 6379,
    password: config.redis.password,
    db: config.redis.db + 1,
  },
  defaultJobOptions: {
    removeOnComplete: 20,
    removeOnFail: 50,
    attempts: 2,
    timeout: 30000,
  },
});

// Connect to Redis
export const connectRedis = async (): Promise<void> => {
  try {
    await redis.connect();
    await queueRedis.connect();
    logger.info('Redis connections established');
  } catch (error) {
    logger.error('Failed to connect to Redis', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
};

// Disconnect from Redis
export const disconnectRedis = async (): Promise<void> => {
  try {
    await redis.disconnect();
    await queueRedis.disconnect();
    await emailQueue.close();
    await auditQueue.close();
    await fileProcessingQueue.close();
    logger.info('Redis connections closed');
  } catch (error) {
    logger.error('Error disconnecting from Redis', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Health check function
export const checkRedisHealth = async (): Promise<boolean> => {
  try {
    const result = await redis.ping();
    return result === 'PONG';
  } catch (error) {
    logger.error('Redis health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
};

// Cache helper functions
export const cache = {
  get: async <T>(key: string): Promise<T | null> => {
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error', { key, error });
      return null;
    }
  },

  set: async (key: string, value: any, ttl?: number): Promise<void> => {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await redis.setex(key, ttl, serialized);
      } else {
        await redis.set(key, serialized);
      }
    } catch (error) {
      logger.error('Cache set error', { key, error });
    }
  },

  del: async (key: string): Promise<void> => {
    try {
      await redis.del(key);
    } catch (error) {
      logger.error('Cache delete error', { key, error });
    }
  },

  exists: async (key: string): Promise<boolean> => {
    try {
      const result = await redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error', { key, error });
      return false;
    }
  },

  expire: async (key: string, ttl: number): Promise<void> => {
    try {
      await redis.expire(key, ttl);
    } catch (error) {
      logger.error('Cache expire error', { key, ttl, error });
    }
  },
};

export default redis;