import { Router, Response } from 'express';
import { AuthenticatedRequest } from '@/types';
import { checkDatabaseHealth } from '@/config/database';
import { checkRedisHealth } from '@/config/redis';
import { sendSuccess } from '@/middleware/error';

const router = Router();

// Basic health check
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  sendSuccess(res, {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  });
});

// Detailed health check
router.get('/detailed', async (req: AuthenticatedRequest, res: Response) => {
  const checks = await Promise.allSettled([
    checkDatabaseHealth(),
    checkRedisHealth(),
  ]);

  const dbHealth = checks[0].status === 'fulfilled' ? checks[0].value : false;
  const redisHealth = checks[1].status === 'fulfilled' ? checks[1].value : false;

  const allHealthy = dbHealth && redisHealth;

  const healthData = {
    status: allHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    services: {
      database: dbHealth ? 'healthy' : 'unhealthy',
      redis: redisHealth ? 'healthy' : 'unhealthy',
    },
    memory: {
      used: process.memoryUsage().heapUsed,
      total: process.memoryUsage().heapTotal,
      external: process.memoryUsage().external,
    },
    version: process.version,
  };

  if (allHealthy) {
    sendSuccess(res, healthData);
  } else {
    res.status(503).json({
      success: false,
      data: healthData,
    });
  }
});

// Readiness check for Kubernetes
router.get('/ready', async (req: AuthenticatedRequest, res: Response) => {
  const dbReady = await checkDatabaseHealth();
  const redisReady = await checkRedisHealth();

  if (dbReady && redisReady) {
    sendSuccess(res, { status: 'ready' });
  } else {
    res.status(503).json({
      success: false,
      error: {
        code: 'NOT_READY',
        message: 'Service not ready',
      },
    });
  }
});

// Liveness check for Kubernetes
router.get('/live', (req: AuthenticatedRequest, res: Response) => {
  sendSuccess(res, { status: 'alive' });
});

export default router;