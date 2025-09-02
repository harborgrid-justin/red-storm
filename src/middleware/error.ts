import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, AppError, ApiResponse, ErrorHandler } from '@/types';
import { logger } from '@/config/logger';
import { config } from '@/config';

// Async error handler wrapper
export const asyncHandler = (
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Global error handler
export const errorHandler: ErrorHandler = (
  error: Error,
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Internal server error';

  // Handle known error types
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
  } else if (error.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = error.message;
  } else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid token';
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Token expired';
  } else if (error.name === 'PrismaClientKnownRequestError') {
    // Handle Prisma errors
    const prismaError = error as any;
    switch (prismaError.code) {
      case 'P2002':
        statusCode = 409;
        code = 'DUPLICATE_ENTRY';
        message = 'Resource already exists';
        break;
      case 'P2025':
        statusCode = 404;
        code = 'NOT_FOUND';
        message = 'Resource not found';
        break;
      default:
        statusCode = 500;
        code = 'DATABASE_ERROR';
        message = 'Database operation failed';
    }
  }

  // Log error
  logger.error('Request Error', {
    message: error.message,
    stack: error.stack,
    statusCode,
    code,
    url: req.url,
    method: req.method,
    correlationId: req.correlationId,
    userId: req.user?.id,
  });

  // Prepare response
  const response: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      ...(config.isDevelopment && { stack: error.stack }),
    },
    meta: {
      timestamp: new Date().toISOString(),
      version: config.apiVersion,
      correlationId: req.correlationId,
    },
  };

  res.status(statusCode).json(response);
};

// 404 handler
export const notFoundHandler = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const error = new AppError(`Route ${req.originalUrl} not found`, 404, 'ROUTE_NOT_FOUND');
  next(error);
};

// Success response helper
export const sendSuccess = <T>(
  res: Response,
  data?: T,
  message?: string,
  statusCode = 200
): void => {
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      version: config.apiVersion,
    },
  };

  if (message) {
    response.meta!.message = message;
  }

  res.status(statusCode).json(response);
};

// Paginated response helper
export const sendPaginatedSuccess = <T>(
  res: Response,
  data: T[],
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  },
  message?: string
): void => {
  const response: ApiResponse<T[]> = {
    success: true,
    data,
    pagination,
    meta: {
      timestamp: new Date().toISOString(),
      version: config.apiVersion,
    },
  };

  if (message) {
    response.meta!.message = message;
  }

  res.json(response);
};

// Error response helper
export const sendError = (
  res: Response,
  message: string,
  statusCode = 500,
  code = 'ERROR',
  details?: any
): void => {
  const response: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      details,
    },
    meta: {
      timestamp: new Date().toISOString(),
      version: config.apiVersion,
    },
  };

  res.status(statusCode).json(response);
};

export default {
  asyncHandler,
  errorHandler,
  notFoundHandler,
  sendSuccess,
  sendPaginatedSuccess,
  sendError,
};