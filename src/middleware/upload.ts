import multer, { StorageEngine } from 'multer';
import multerS3 from 'multer-s3';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileTypeFromBuffer } from 'file-type';
import { config } from '../config';
import { logger } from '../config/logger';
import { generateSafeFilename, formatFileSize } from '../utils/helpers';
import { AuthenticatedRequest } from '../types';
import { Response, NextFunction } from 'express';

// S3 client configuration
const s3Client = new S3Client({
  region: config.aws?.region || process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: config.aws?.accessKeyId || process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: config.aws?.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

// Local storage engine for evidence files
class EvidenceStorageEngine implements StorageEngine {
  private uploadsPath: string;

  constructor(uploadsPath: string) {
    this.uploadsPath = uploadsPath;
  }

  async _handleFile(
    req: AuthenticatedRequest,
    file: Express.Multer.File,
    callback: (error?: any, info?: Partial<Express.Multer.File>) => void
  ): Promise<void> {
    try {
      // Ensure uploads directory exists
      await fs.mkdir(this.uploadsPath, { recursive: true });

      // Generate safe filename
      const safeFilename = generateSafeFilename(file.originalname);
      const filePath = path.join(this.uploadsPath, safeFilename);

      // Create file stream
      const chunks: Buffer[] = [];
      
      file.stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      file.stream.on('end', async () => {
        try {
          const buffer = Buffer.concat(chunks);

          // Validate file type
          const detectedType = await fileTypeFromBuffer(buffer);
          if (!detectedType) {
            return callback(new Error('Unable to detect file type'));
          }

          // Calculate file hash for duplicate detection
          const hash = crypto.createHash('sha256').update(buffer).digest('hex');

          // Write file to disk
          await fs.writeFile(filePath, buffer);

          // Log file upload
          logger.info('File uploaded successfully', {
            originalName: file.originalname,
            filename: safeFilename,
            size: buffer.length,
            mimetype: detectedType.mime,
            hash,
            userId: req.user?.id,
            correlationId: req.correlationId,
          });

          callback(null, {
            filename: safeFilename,
            path: filePath,
            size: buffer.length,
            mimetype: detectedType.mime,
            fieldname: file.fieldname,
            originalname: file.originalname,
            buffer,
            destination: this.uploadsPath,
          });
        } catch (error) {
          callback(error);
        }
      });

      file.stream.on('error', callback);
    } catch (error) {
      callback(error);
    }
  }

  _removeFile(
    req: AuthenticatedRequest,
    file: Express.Multer.File,
    callback: (error: Error | null) => void
  ): void {
    fs.unlink(file.path!)
      .then(() => callback(null))
      .catch(callback);
  }
}

// S3 storage configuration for cloud uploads
const s3Storage = multerS3({
  s3: s3Client as any,
  bucket: config.aws?.bucketName || process.env.AWS_S3_BUCKET || 'evidence-files',
  acl: 'private',
  metadata: (req: AuthenticatedRequest, file, cb) => {
    cb(null, {
      uploadedBy: req.user?.id || 'anonymous',
      correlationId: req.correlationId || 'unknown',
      originalName: file.originalname,
      uploadTime: new Date().toISOString(),
    });
  },
  key: (req: AuthenticatedRequest, file, cb) => {
    const safeFilename = generateSafeFilename(file.originalname);
    const key = `evidence/${new Date().getFullYear()}/${new Date().getMonth() + 1}/${safeFilename}`;
    cb(null, key);
  },
  contentType: multerS3.AUTO_CONTENT_TYPE,
});

// File filter for evidence uploads
const evidenceFileFilter = (
  req: AuthenticatedRequest,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
) => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/tiff',
    'video/mp4',
    'video/avi',
    'video/mov',
    'video/wmv',
    'audio/mp3',
    'audio/wav',
    'audio/aac',
    'audio/ogg',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    callback(null, true);
  } else {
    logger.warn('File type not allowed', {
      mimetype: file.mimetype,
      originalname: file.originalname,
      userId: req.user?.id,
      correlationId: req.correlationId,
    });
    callback(new Error(`File type ${file.mimetype} not allowed`));
  }
};

// Local evidence upload configuration
export const evidenceUpload = multer({
  storage: new EvidenceStorageEngine(config.upload?.uploadPath || './uploads'),
  fileFilter: evidenceFileFilter,
  limits: {
    fileSize: config.upload?.maxFileSize || 100 * 1024 * 1024, // 100MB default
    files: 10, // Max 10 files per upload
  },
});

// S3 evidence upload configuration
export const s3EvidenceUpload = multer({
  storage: s3Storage,
  fileFilter: evidenceFileFilter,
  limits: {
    fileSize: config.upload?.maxFileSize || 100 * 1024 * 1024, // 100MB default
    files: 10, // Max 10 files per upload
  },
});

// Generate presigned URL for direct S3 uploads
export const generatePresignedUrl = async (
  key: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<string> => {
  const command = new PutObjectCommand({
    Bucket: config.aws?.bucketName || process.env.AWS_S3_BUCKET || 'evidence-files',
    Key: key,
    ContentType: contentType,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
};

// File upload error handler
export const handleUploadError = (
  error: any,
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (error instanceof multer.MulterError) {
    logger.error('Multer upload error', {
      error: error.message,
      code: error.code,
      field: error.field,
      userId: req.user?.id,
      correlationId: req.correlationId,
    });

    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(413).json({
          success: false,
          error: {
            code: 'FILE_TOO_LARGE',
            message: `File size exceeds limit of ${formatFileSize(config.upload?.maxFileSize || 100 * 1024 * 1024)}`,
          },
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(413).json({
          success: false,
          error: {
            code: 'TOO_MANY_FILES',
            message: 'Too many files uploaded',
          },
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          error: {
            code: 'UNEXPECTED_FILE',
            message: 'Unexpected file field',
          },
        });
      default:
        return res.status(400).json({
          success: false,
          error: {
            code: 'UPLOAD_ERROR',
            message: error.message,
          },
        });
    }
  }

  if (error.message?.includes('File type') && error.message?.includes('not allowed')) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_FILE_TYPE',
        message: error.message,
      },
    });
  }

  logger.error('Upload error', {
    error: error.message,
    stack: error.stack,
    userId: req.user?.id,
    correlationId: req.correlationId,
  });

  return res.status(500).json({
    success: false,
    error: {
      code: 'UPLOAD_FAILED',
      message: 'File upload failed',
    },
  });
};

// Chunked upload handler for large files
export class ChunkedUploadManager {
  private chunks: Map<string, { chunks: Buffer[], totalSize: number, expectedChunks: number }> = new Map();

  async handleChunk(
    uploadId: string,
    chunkIndex: number,
    totalChunks: number,
    chunkData: Buffer
  ): Promise<{ complete: boolean; buffer?: Buffer }> {
    if (!this.chunks.has(uploadId)) {
      this.chunks.set(uploadId, {
        chunks: new Array(totalChunks),
        totalSize: 0,
        expectedChunks: totalChunks,
      });
    }

    const upload = this.chunks.get(uploadId)!;
    upload.chunks[chunkIndex] = chunkData;
    upload.totalSize += chunkData.length;

    // Check if all chunks are received
    const receivedChunks = upload.chunks.filter(chunk => chunk !== undefined).length;
    
    if (receivedChunks === totalChunks) {
      const completeBuffer = Buffer.concat(upload.chunks);
      this.chunks.delete(uploadId); // Clean up
      return { complete: true, buffer: completeBuffer };
    }

    return { complete: false };
  }

  cleanup(uploadId: string): void {
    this.chunks.delete(uploadId);
  }
}

export const chunkedUploadManager = new ChunkedUploadManager();

export default {
  evidenceUpload,
  s3EvidenceUpload,
  generatePresignedUrl,
  handleUploadError,
  chunkedUploadManager,
};