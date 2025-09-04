import { Request, Response } from 'express';
import { JwtPayload } from 'jsonwebtoken';

// User types
export interface AuthenticatedUser {
  id: string;
  email: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  roles: string[];
  permissions: string[];
}

export interface JWTPayload extends JwtPayload {
  userId: string;
  email: string;
  roles: string[];
  type: 'access' | 'refresh';
}

// Request extensions
export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  correlationId?: string;
  apiVersion?: string;
  log?: any;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  meta?: {
    timestamp: string;
    version: string;
    correlationId?: string;
    message?: string;
  };
}

// Pagination types
export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Filter types
export interface BaseFilter {
  search?: string;
  createdAt?: {
    from?: Date;
    to?: Date;
  };
  updatedAt?: {
    from?: Date;
    to?: Date;
  };
}

// Case related types
export interface CaseFilter extends BaseFilter {
  status?: string[];
  priority?: string[];
  assignedToId?: string;
  createdById?: string;
  tags?: string[];
}

export interface EvidenceFilter extends BaseFilter {
  caseId?: string;
  type?: string[];
  status?: string[];
  collectedById?: string;
  tags?: string[];
}

// Service types
export interface ServiceHealth {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  details?: Record<string, any>;
}

// Audit types
export interface AuditEvent {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

// Queue job types
export interface EmailJob {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  template: string;
  data: Record<string, any>;
  priority?: number;
}

export interface AuditJob extends AuditEvent {
  // Extends AuditEvent for queued processing
}

export interface FileProcessingJob {
  filePath: string;
  userId: string;
  evidenceId?: string;
  operations: string[];
  metadata?: Record<string, any>;
}

// GraphQL types
export interface GraphQLContext {
  user?: AuthenticatedUser;
  prisma: any;
  redis: any;
  correlationId?: string;
  req: Request;
  res: Response;
}

// WebSocket types
export interface SocketUser {
  userId: string;
  socketId: string;
  roles: string[];
  lastSeen: Date;
}

// Error types
export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  public details?: Array<{
    field: string;
    message: string;
    code: string;
  }>;

  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND_ERROR');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT_ERROR');
    this.name = 'ConflictError';
  }
}

// Middleware types
export type AsyncHandler = (
  req: AuthenticatedRequest,
  res: Response,
  next: any
) => Promise<void>;

export type ErrorHandler = (
  error: Error,
  req: AuthenticatedRequest,
  res: Response,
  next: any
) => void;

// Service Discovery types
export interface ServiceRegistration {
  id: string;
  name: string;
  address: string;
  port: number;
  tags: string[];
  check: {
    http?: string;
    tcp?: string;
    interval: string;
    timeout: string;
  };
}

// Configuration types
export interface DatabaseConfig {
  url: string;
  poolSize: number;
  timeout: number;
}

export interface RedisConfig {
  url: string;
  password?: string;
  db: number;
}

export interface SecurityConfig {
  bcryptSaltRounds: number;
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
}

// File upload types
export interface FileUpload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  filename: string;
  path: string;
}

export interface ProcessedFile {
  id: string;
  originalName: string;
  filename: string;
  path: string;
  mimeType: string;
  size: number;
  checksumMd5: string;
  checksumSha256: string;
  metadata?: Record<string, any>;
}

// File Processing types
export interface FileProcessingStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  startTime?: Date;
  endTime?: Date;
  errors?: string[];
}

export interface ExifData {
  dateTime?: string;
  gps?: {
    latitude: number;
    longitude: number;
    altitude?: number;
  };
  camera?: {
    make: string;
    model?: string;
    software?: string;
  };
  dimensions?: {
    width: number;
    height: number;
  };
}

export interface MediaMetadata {
  duration: number;
  dimensions?: {
    width: number;
    height: number;
  };
  thumbnails?: string[];
  format?: string;
  codec?: string;
  bitrate?: number;
}

export interface DocumentMetadata {
  pages: number;
  extractedText?: string;
  author?: string;
  title?: string;
  creationDate?: Date;
  modificationDate?: Date;
}

export interface VirusScanResult {
  clean: boolean;
  scanTime: Date;
  engine: string;
  threats?: string[];
  signature?: string;
}

// Chain of Custody types
export interface ChainOfCustodyEntry {
  id: string;
  action: string;
  userId: string;
  timestamp: string;
  location: string;
  notes: string;
  digitalSignature?: string;
  metadata?: any;
  integrityCheck?: {
    hash: string;
    algorithm: string;
    verified: boolean;
    timestamp: string;
  };
}

export interface CustodyTransferRequest {
  evidenceId: string;
  fromUserId: string;
  toUserId: string;
  reason: string;
  location: string;
  approvalRequired: boolean;
  approvers?: string[];
  scheduledAt?: Date;
  notes?: string;
}

export interface CustodyApproval {
  userId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  timestamp?: string;
  notes?: string;
  digitalSignature?: string;
}

export interface IntegrityVerificationResult {
  evidenceId: string;
  verified: boolean;
  currentHash: string;
  originalHash: string;
  algorithm: string;
  verifiedAt: Date;
  discrepancies?: string[];
}

// Background Job types
export interface FileProcessingJobData {
  evidenceId: string;
  filePath: string;
  originalFilename: string;
  mimetype: string;
  size: number;
  userId: string;
  caseId: string;
}

export interface ChainOfCustodyJobData {
  evidenceId: string;
  action: string;
  userId: string;
  location?: string;
  notes?: string;
  metadata?: any;
}

export interface FileCleanupJobData {
  olderThan: Date;
  types: string[];
}

// Upload types
export interface ChunkedUploadInfo {
  uploadId: string;
  chunkIndex: number;
  totalChunks: number;
  chunkSize: number;
  totalSize: number;
  filename: string;
  mimetype: string;
}

export interface PresignedUrlRequest {
  filename: string;
  contentType: string;
  size: number;
  evidenceId?: string;
}

export interface PresignedUrlResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
  maxSize: number;
}

// AWS/S3 Configuration types
export interface AWSConfig {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string;
}

export interface EmailConfig {
  host?: string;
  port?: number;
  secure: boolean;
  auth: {
    user?: string;
    pass?: string;
  };
  from?: string;
}

export interface UploadConfig {
  maxFileSize: number;
  uploadPath: string;
}

// Notification types
export interface CustodyAlert {
  evidenceId: string;
  caseNumber: string;
  action: string;
  user: string;
  timestamp: Date;
  location: string;
  notes?: string;
  recipients: string[];
}

export interface ProcessingNotification {
  evidenceId: string;
  caseId: string;
  status: 'started' | 'completed' | 'failed';
  progress?: number;
  metadata?: any;
  error?: string;
}

// Job Statistics types
export interface JobStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  total: number;
}

// Scheduled Job types
export interface ScheduledJobStatus {
  name: string;
  nextInvocation?: string;
  running: boolean;
  lastRun?: string;
  lastResult?: 'success' | 'failure';
}