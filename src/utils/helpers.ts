import { PaginationOptions, PaginationResult } from '@/types';

// Generate pagination metadata
export const getPaginationMeta = (
  page: number,
  limit: number,
  total: number
) => {
  const totalPages = Math.ceil(total / limit);
  
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
};

// Apply pagination to Prisma query
export const applyPagination = (options: PaginationOptions) => {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const skip = (page - 1) * limit;
  
  return {
    skip,
    take: limit,
    page,
    limit,
  };
};

// Apply sorting to Prisma query
export const applySorting = (options: PaginationOptions) => {
  if (!options.sortBy) {
    return undefined;
  }
  
  return {
    [options.sortBy]: options.sortOrder || 'desc',
  };
};

// Format pagination result
export const formatPaginatedResult = <T>(
  data: T[],
  page: number,
  limit: number,
  total: number
): PaginationResult<T> => {
  return {
    data,
    pagination: getPaginationMeta(page, limit, total),
  };
};

// Generate SQL LIKE pattern for search
export const generateSearchPattern = (query: string): string => {
  return `%${query.replace(/[%_]/g, '\\$&')}%`;
};

// Build search conditions for Prisma
export const buildSearchConditions = (query: string, fields: string[]) => {
  if (!query || fields.length === 0) {
    return undefined;
  }
  
  return {
    OR: fields.map(field => ({
      [field]: {
        contains: query,
        mode: 'insensitive',
      },
    })),
  };
};

// Apply date range filter
export const applyDateRangeFilter = (
  dateRange?: { from?: Date; to?: Date }
) => {
  if (!dateRange || (!dateRange.from && !dateRange.to)) {
    return undefined;
  }
  
  const conditions: any = {};
  
  if (dateRange.from) {
    conditions.gte = dateRange.from;
  }
  
  if (dateRange.to) {
    conditions.lte = dateRange.to;
  }
  
  return conditions;
};

// Build complex filter conditions
export const buildFilterConditions = (filters: Record<string, any>) => {
  const conditions: any = {};
  
  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      return;
    }
    
    if (Array.isArray(value) && value.length > 0) {
      conditions[key] = {
        in: value,
      };
    } else if (typeof value === 'object' && value.from || value.to) {
      conditions[key] = applyDateRangeFilter(value);
    } else if (typeof value === 'string' && value.trim() !== '') {
      conditions[key] = value;
    } else if (typeof value !== 'string') {
      conditions[key] = value;
    }
  });
  
  return Object.keys(conditions).length > 0 ? conditions : undefined;
};

// Generate case number
export const generateCaseNumber = (prefix = 'CASE'): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`.toUpperCase();
};

// Generate evidence item number
export const generateEvidenceNumber = (caseNumber: string, sequence: number): string => {
  const paddedSequence = sequence.toString().padStart(3, '0');
  return `${caseNumber}-E${paddedSequence}`;
};

// Format file size in human readable format
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

// Validate file type
export const isValidFileType = (
  mimetype: string,
  allowedTypes: string[]
): boolean => {
  return allowedTypes.includes(mimetype);
};

// Extract file extension
export const getFileExtension = (filename: string): string => {
  return filename.split('.').pop()?.toLowerCase() || '';
};

// Generate safe filename
export const generateSafeFilename = (originalName: string): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const extension = getFileExtension(originalName);
  const baseName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_').substring(0, 50);
  
  return `${timestamp}_${random}_${baseName}${extension ? '.' + extension : ''}`;
};

// Parse CSV data
export const parseCSV = (csvData: string): string[][] => {
  const lines = csvData.split('\n');
  const result: string[][] = [];
  
  lines.forEach(line => {
    if (line.trim()) {
      const columns = line.split(',').map(col => col.trim().replace(/"/g, ''));
      result.push(columns);
    }
  });
  
  return result;
};

// Convert object to CSV
export const objectsToCSV = (objects: Record<string, any>[]): string => {
  if (objects.length === 0) return '';
  
  const headers = Object.keys(objects[0]);
  const csvRows: string[] = [];
  
  // Add headers
  csvRows.push(headers.map(header => `"${header}"`).join(','));
  
  // Add data rows
  objects.forEach(obj => {
    const values = headers.map(header => {
      const value = obj[header];
      return `"${value !== null && value !== undefined ? String(value).replace(/"/g, '""') : ''}"`;
    });
    csvRows.push(values.join(','));
  });
  
  return csvRows.join('\n');
};

// Deep clone object
export const deepClone = <T>(obj: T): T => {
  return JSON.parse(JSON.stringify(obj));
};

// Remove undefined values from object
export const removeUndefined = <T extends Record<string, any>>(obj: T): Partial<T> => {
  const result: Partial<T> = {};
  
  Object.entries(obj).forEach(([key, value]) => {
    if (value !== undefined) {
      result[key as keyof T] = value;
    }
  });
  
  return result;
};

// Flatten nested object
export const flattenObject = (obj: Record<string, any>, prefix = ''): Record<string, any> => {
  const flattened: Record<string, any> = {};
  
  Object.keys(obj).forEach(key => {
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;
    
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(flattened, flattenObject(value, newKey));
    } else {
      flattened[newKey] = value;
    }
  });
  
  return flattened;
};

// Sleep utility
export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Retry utility
export const retry = async <T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delay = 1000
): Promise<T> => {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts) {
        throw lastError;
      }
      
      await sleep(delay * attempt);
    }
  }
  
  throw lastError!;
};

// Debounce utility
export const debounce = <T extends (...args: any[]) => void>(
  func: T,
  wait: number
): T => {
  let timeout: NodeJS.Timeout;
  
  return ((...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  }) as T;
};

export default {
  getPaginationMeta,
  applyPagination,
  applySorting,
  formatPaginatedResult,
  generateSearchPattern,
  buildSearchConditions,
  applyDateRangeFilter,
  buildFilterConditions,
  generateCaseNumber,
  generateEvidenceNumber,
  formatFileSize,
  isValidFileType,
  getFileExtension,
  generateSafeFilename,
  parseCSV,
  objectsToCSV,
  deepClone,
  removeUndefined,
  flattenObject,
  sleep,
  retry,
  debounce,
};