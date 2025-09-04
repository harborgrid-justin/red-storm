import { Response } from 'express';
import { ApiResponse, PaginationResult } from '@/types';
import { config } from '@/config';

// Send success response
export const sendSuccess = <T>(
  res: Response,
  data?: T,
  message?: string,
  statusCode = 200
): Response => {
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      version: config.apiVersion,
      message,
    },
  };

  return res.status(statusCode).json(response);
};

// Send error response
export const sendError = (
  res: Response,
  message: string,
  statusCode = 500,
  code?: string,
  details?: any
): Response => {
  const response: ApiResponse = {
    success: false,
    error: {
      code: code || 'INTERNAL_ERROR',
      message,
      details,
    },
    meta: {
      timestamp: new Date().toISOString(),
      version: config.apiVersion,
    },
  };

  return res.status(statusCode).json(response);
};

// Send paginated response
export const sendPaginatedSuccess = <T>(
  res: Response,
  result: PaginationResult<T>,
  message?: string,
  statusCode = 200
): Response => {
  const response: ApiResponse<T[]> = {
    success: true,
    data: result.data,
    pagination: result.pagination,
    meta: {
      timestamp: new Date().toISOString(),
      version: config.apiVersion,
      message,
    },
  };

  return res.status(statusCode).json(response);
};

// Format paginated result for consistent structure
export const formatPaginatedResult = <T>(
  data: T[],
  page: number,
  limit: number,
  total: number
): PaginationResult<T> => {
  const totalPages = Math.ceil(total / limit);
  
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
};