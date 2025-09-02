import { PrismaClient } from '@prisma/client';
import { config } from './index';
import { logger } from './logger';

// Prisma client options
const prismaOptions = {
  datasources: {
    db: {
      url: config.database.url,
    },
  },
  log: [
    {
      emit: 'event' as const,
      level: 'query' as const,
    },
    {
      emit: 'event' as const,
      level: 'error' as const,
    },
    {
      emit: 'event' as const,
      level: 'info' as const,
    },
    {
      emit: 'event' as const,
      level: 'warn' as const,
    },
  ],
};

// Create Prisma client instance
export const prisma = new PrismaClient(prismaOptions);

// Log database queries in development
if (config.isDevelopment) {
  prisma.$on('query', (e) => {
    logger.debug('Database Query', {
      query: e.query,
      params: e.params,
      duration: e.duration,
    });
  });
}

// Log database errors
prisma.$on('error', (e) => {
  logger.error('Database Error', {
    target: e.target,
    message: e.message,
  });
});

// Log database info
prisma.$on('info', (e) => {
  logger.info('Database Info', {
    target: e.target,
    message: e.message,
  });
});

// Log database warnings
prisma.$on('warn', (e) => {
  logger.warn('Database Warning', {
    target: e.target,
    message: e.message,
  });
});

// Database connection function
export const connectDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error('Failed to connect to database', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
};

// Database disconnection function
export const disconnectDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected successfully');
  } catch (error) {
    logger.error('Failed to disconnect from database', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Health check function
export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Database health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
};

// Transaction helper
export const withTransaction = async <T>(
  callback: (prisma: PrismaClient) => Promise<T>
): Promise<T> => {
  return await prisma.$transaction(callback);
};

export default prisma;