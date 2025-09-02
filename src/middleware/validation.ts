import { Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';
import { AuthenticatedRequest, ValidationError } from '@/types';

// Generic validation middleware
export const validate = (schema: {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      // Validate request body
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }

      // Validate request params
      if (schema.params) {
        req.params = schema.params.parse(req.params);
      }

      // Validate query parameters
      if (schema.query) {
        req.query = schema.query.parse(req.query);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = new ValidationError('Validation failed');
        validationError.details = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        next(validationError);
      } else {
        next(error);
      }
    }
  };
};

// Common validation schemas
export const commonSchemas = {
  // ID parameter validation
  id: z.string().cuid('Invalid ID format'),
  
  // Pagination validation
  pagination: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),

  // Search validation
  search: z.object({
    q: z.string().min(1).max(100).optional(),
    filters: z.string().optional(),
  }),

  // Date range validation
  dateRange: z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }).refine(
    (data) => !data.from || !data.to || data.from <= data.to,
    { message: 'Start date must be before end date' }
  ),
};

// User validation schemas
export const userSchemas = {
  create: z.object({
    email: z.string().email('Invalid email format'),
    username: z.string().min(3).max(50).optional(),
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    password: z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
        'Password must contain uppercase, lowercase, number and special character'),
    roles: z.array(z.string()).optional(),
  }),

  update: z.object({
    email: z.string().email().optional(),
    username: z.string().min(3).max(50).optional(),
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    isActive: z.boolean().optional(),
  }),

  changePassword: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
        'Password must contain uppercase, lowercase, number and special character'),
    confirmPassword: z.string(),
  }).refine(
    (data) => data.newPassword === data.confirmPassword,
    { message: 'Passwords do not match', path: ['confirmPassword'] }
  ),

  login: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
    rememberMe: z.boolean().default(false),
  }),
};

// Case validation schemas
export const caseSchemas = {
  create: z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
    assignedToId: z.string().cuid().optional(),
    tags: z.array(z.string()).optional(),
  }),

  update: z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    status: z.enum(['ACTIVE', 'CLOSED', 'ARCHIVED', 'PENDING']).optional(),
    assignedToId: z.string().cuid().optional(),
    tags: z.array(z.string()).optional(),
  }),

  filter: z.object({
    status: z.array(z.string()).optional(),
    priority: z.array(z.string()).optional(),
    assignedToId: z.string().cuid().optional(),
    createdById: z.string().cuid().optional(),
    tags: z.array(z.string()).optional(),
    search: z.string().max(100).optional(),
    createdAt: commonSchemas.dateRange.optional(),
    updatedAt: commonSchemas.dateRange.optional(),
  }),
};

// Evidence validation schemas
export const evidenceSchemas = {
  create: z.object({
    caseId: z.string().cuid(),
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    type: z.enum(['DIGITAL', 'PHYSICAL', 'DOCUMENT', 'PHOTO', 'VIDEO', 'AUDIO', 'OTHER']),
    location: z.string().max(500).optional(),
    metadata: z.record(z.any()).optional(),
    tags: z.array(z.string()).optional(),
  }),

  update: z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    type: z.enum(['DIGITAL', 'PHYSICAL', 'DOCUMENT', 'PHOTO', 'VIDEO', 'AUDIO', 'OTHER']).optional(),
    status: z.enum(['COLLECTED', 'PROCESSING', 'ANALYZED', 'STORED', 'DISPOSED']).optional(),
    location: z.string().max(500).optional(),
    metadata: z.record(z.any()).optional(),
    tags: z.array(z.string()).optional(),
  }),

  filter: z.object({
    caseId: z.string().cuid().optional(),
    type: z.array(z.string()).optional(),
    status: z.array(z.string()).optional(),
    collectedById: z.string().cuid().optional(),
    tags: z.array(z.string()).optional(),
    search: z.string().max(100).optional(),
    collectedAt: commonSchemas.dateRange.optional(),
  }),
};

// Role validation schemas
export const roleSchemas = {
  create: z.object({
    name: z.string().min(1).max(50).regex(/^[a-zA-Z_]+$/, 'Only letters and underscores allowed'),
    description: z.string().max(200).optional(),
    permissions: z.array(z.string()).min(1, 'At least one permission required'),
  }),

  update: z.object({
    name: z.string().min(1).max(50).regex(/^[a-zA-Z_]+$/, 'Only letters and underscores allowed').optional(),
    description: z.string().max(200).optional(),
    permissions: z.array(z.string()).optional(),
  }),
};

// File upload validation
export const fileUploadSchema = z.object({
  file: z.object({
    originalname: z.string(),
    mimetype: z.string(),
    size: z.number().max(10 * 1024 * 1024, 'File size must be less than 10MB'),
    buffer: z.instanceof(Buffer),
  }),
  metadata: z.record(z.any()).optional(),
});

// API key validation
export const apiKeySchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(z.string()).min(1),
  expiresAt: z.coerce.date().optional(),
});

// Webhook validation
export const webhookSchema = z.object({
  url: z.string().url('Invalid URL format'),
  events: z.array(z.string()).min(1, 'At least one event required'),
  secret: z.string().min(16).optional(),
  active: z.boolean().default(true),
});

// Export validation middleware creators
export const validateBody = (schema: ZodSchema) => validate({ body: schema });
export const validateParams = (schema: ZodSchema) => validate({ params: schema });
export const validateQuery = (schema: ZodSchema) => validate({ query: schema });

// Common middleware combinations
export const validateId = validateParams(z.object({ id: commonSchemas.id }));
export const validatePagination = validateQuery(commonSchemas.pagination);

export default {
  validate,
  validateBody,
  validateParams,
  validateQuery,
  validateId,
  validatePagination,
  commonSchemas,
  userSchemas,
  caseSchemas,
  evidenceSchemas,
  roleSchemas,
  fileUploadSchema,
  apiKeySchema,
  webhookSchema,
};