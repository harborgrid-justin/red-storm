import rateLimit from 'express-rate-limit';
import { Redis } from 'ioredis';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '@/types';
import { config } from '@/config';
import { redis } from '@/config/redis';
import { logger } from '@/config/logger';

// Rate limiting with Redis store
class RedisStore {
  private redis: Redis;
  private prefix: string;

  constructor(redis: Redis, prefix = 'rl:') {
    this.redis = redis;
    this.prefix = prefix;
  }

  async incr(key: string): Promise<{ totalHits: number; timeToExpire?: number }> {
    const redisKey = this.prefix + key;
    const multi = this.redis.multi();
    multi.incr(redisKey);
    multi.ttl(redisKey);
    const results = await multi.exec();
    
    const totalHits = results?.[0]?.[1] as number || 0;
    const timeToExpire = results?.[1]?.[1] as number || undefined;
    
    return { totalHits, timeToExpire };
  }

  async decrement(key: string): Promise<void> {
    const redisKey = this.prefix + key;
    await this.redis.decr(redisKey);
  }

  async resetKey(key: string): Promise<void> {
    const redisKey = this.prefix + key;
    await this.redis.del(redisKey);
  }

  async resetAll(): Promise<void> {
    const keys = await this.redis.keys(this.prefix + '*');
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

// General rate limiting
export const rateLimiter = rateLimit({
  windowMs: config.security.rateLimit.windowMs,
  max: config.security.rateLimit.maxRequests,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore(redis, 'rate_limit:'),
  keyGenerator: (req: AuthenticatedRequest) => {
    // Use user ID if authenticated, otherwise IP
    return req.user?.id || req.ip || 'unknown';
  },
  handler: (req: AuthenticatedRequest, res: Response) => {
    logger.warn('Rate limit exceeded', {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      correlationId: req.correlationId,
    });
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
      },
    });
  },
});

// Strict rate limiting for auth endpoints
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts, please try again later',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore(redis, 'auth_limit:'),
  keyGenerator: (req: AuthenticatedRequest) => req.ip || 'unknown',
  handler: (req: AuthenticatedRequest, res: Response) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      correlationId: req.correlationId,
    });
    res.status(429).json({
      success: false,
      error: {
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts, please try again later',
      },
    });
  },
});

// File upload rate limiting
export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 uploads per minute
  message: {
    success: false,
    error: {
      code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
      message: 'Too many uploads, please try again later',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore(redis, 'upload_limit:'),
  keyGenerator: (req: AuthenticatedRequest) => req.user?.id || req.ip || 'unknown',
});

// Security headers with Helmet
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: config.isProduction,
  crossOriginOpenerPolicy: config.isProduction,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  dnsPrefetchControl: true,
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: config.isProduction ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  } : false,
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: false,
  referrerPolicy: { policy: "no-referrer" },
  xssFilter: true,
});

// CORS configuration
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      config.cors.origin,
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
    ];
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS request blocked', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: config.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Correlation-ID',
    'X-Request-ID',
    'Accept',
    'Origin',
  ],
  exposedHeaders: [
    'X-Correlation-ID',
    'X-Request-ID',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],
  maxAge: 86400, // 24 hours
});

// Response compression
export const compressionMiddleware = compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6, // Good balance between compression ratio and speed
  threshold: 1024, // Only compress responses > 1KB
});

// Request size limiting
export const requestSizeLimit = (maxSize = '10mb') => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const size = parseInt(req.get('content-length') || '0');
    const maxSizeBytes = parseFloat(maxSize) * (maxSize.includes('mb') ? 1024 * 1024 : 1024);
    
    if (size > maxSizeBytes) {
      logger.warn('Request size limit exceeded', {
        size,
        maxSize: maxSizeBytes,
        userId: req.user?.id,
        correlationId: req.correlationId,
      });
      
      res.status(413).json({
        success: false,
        error: {
          code: 'REQUEST_TOO_LARGE',
          message: 'Request entity too large',
        },
      });
      return;
    }
    
    next();
  };
};

// API versioning middleware
export const apiVersioning = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const version = req.headers['api-version'] as string || 
                  req.query.version as string || 
                  config.apiVersion;
  
  req.apiVersion = version;
  res.setHeader('API-Version', version);
  
  next();
};

// Health check bypass
export const healthCheckBypass = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (req.path === '/health' || req.path === '/health/ready') {
    // Skip rate limiting and other middleware for health checks
    return next();
  }
  
  next();
};

export default {
  rateLimiter,
  authRateLimiter,
  uploadRateLimiter,
  securityHeaders,
  corsMiddleware,
  compressionMiddleware,
  requestSizeLimit,
  apiVersioning,
  healthCheckBypass,
};