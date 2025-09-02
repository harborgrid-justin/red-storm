import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { config } from './index';

// Custom log format with correlation ID
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({
    fillExcept: ['message', 'level', 'timestamp', 'stack']
  }),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'HH:mm:ss.SSS'
  }),
  winston.format.colorize(),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, correlationId }) => {
    const correlation = correlationId ? `[${correlationId}] ` : '';
    const stackTrace = stack ? `\n${stack}` : '';
    return `${timestamp} ${level}: ${correlation}${message}${stackTrace}`;
  })
);

// Create logger instance
export const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: {
    service: 'evidence-platform-backend',
    environment: config.env,
  },
  transports: [
    // Console transport for development
    ...(config.isDevelopment ? [
      new winston.transports.Console({
        format: consoleFormat,
        handleExceptions: true,
        handleRejections: true,
      })
    ] : []),
    
    // File transport for all levels
    new DailyRotateFile({
      filename: 'logs/application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
      format: logFormat,
      handleExceptions: true,
      handleRejections: true,
    }),
    
    // Error-only transport
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      zippedArchive: true,
      maxSize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
      format: logFormat,
      handleExceptions: true,
      handleRejections: true,
    }),
    
    // Audit log transport
    new DailyRotateFile({
      filename: 'logs/audit-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
      format: logFormat,
    }),
  ],
});

// Create specialized audit logger
export const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'evidence-platform-audit',
    environment: config.env,
  },
  transports: [
    new DailyRotateFile({
      filename: 'logs/audit-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
    }),
  ],
});

// Correlation ID middleware for Express
export interface RequestWithCorrelation extends Request {
  correlationId?: string;
}

export const correlationIdMiddleware = (
  req: any,
  res: any,
  next: any
): void => {
  const correlationId = 
    req.headers['x-correlation-id'] as string ||
    req.headers['x-request-id'] as string ||
    `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  req.correlationId = correlationId;
  res.set('X-Correlation-ID', correlationId);
  
  // Add correlation ID to logger metadata
  const originalLogger = logger;
  (req as any).log = originalLogger.child({ correlationId });
  
  next();
};

// Request logging middleware
export const requestLoggingMiddleware = (
  req: any,
  res: any,
  next: any
): void => {
  const start = Date.now();
  
  // Log request
  logger.info('HTTP Request', {
    method: req.method,
    url: req.url,
    userAgent: req.get ? req.get('User-Agent') : req.headers['user-agent'],
    ip: req.ip || req.connection?.remoteAddress,
    correlationId: req.correlationId,
  });
  
  // Capture response
  const originalEnd = res.end;
  res.end = function(chunk: any, encoding: any) {
    const duration = Date.now() - start;
    
    // Log response
    logger.info('HTTP Response', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      correlationId: req.correlationId,
    });
    
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
};

// Error logging function
export const logError = (
  error: Error,
  context?: Record<string, any>
): void => {
  logger.error('Application Error', {
    message: error.message,
    stack: error.stack,
    name: error.name,
    ...context,
  });
};

// Audit logging function
export const logAudit = (
  action: string,
  resource: string,
  userId?: string,
  details?: Record<string, any>
): void => {
  auditLogger.info('Audit Event', {
    action,
    resource,
    userId,
    timestamp: new Date().toISOString(),
    ...details,
  });
};

export default logger;