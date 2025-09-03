import express, { Request, Response } from 'express';
import { validateBody, validateParams, validateQuery, evidenceSchemas } from '../middleware/validation';
import { verifyToken, requirePermission } from '../middleware/auth';
import { uploadRateLimiter } from '../middleware/security';
import { evidenceUpload, s3EvidenceUpload, handleUploadError, generatePresignedUrl, chunkedUploadManager } from '../middleware/upload';
import { fileProcessingWorker, FileProcessingWorker } from '../services/backgroundJobs';
import { chainOfCustodyService } from '../services/chainOfCustody';
import { sendSuccess, sendError, formatPaginatedResult } from '../utils/response';
import { asyncHandler } from '../middleware/error';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../config/database';
import { generateEvidenceNumber } from '../utils/helpers';
import { logger } from '../config/logger';
import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

const router = express.Router();

// Validation schemas for file uploads
const fileUploadSchema = z.object({
  caseId: z.string().cuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z.enum(['DIGITAL', 'PHYSICAL', 'DOCUMENT', 'PHOTO', 'VIDEO', 'AUDIO', 'OTHER']),
  location: z.string().max(500).optional(),
  tags: z.array(z.string()).optional(),
});

const chunkUploadSchema = z.object({
  uploadId: z.string(),
  chunkIndex: z.coerce.number(),
  totalChunks: z.coerce.number(),
  caseId: z.string().cuid(),
  filename: z.string(),
  totalSize: z.coerce.number(),
});

const custodyTransferSchema = z.object({
  toUserId: z.string().cuid(),
  reason: z.string().min(1).max(500),
  location: z.string().min(1).max(200),
  approvalRequired: z.boolean().default(false),
  approvers: z.array(z.string().cuid()).optional(),
  scheduledAt: z.coerce.date().optional(),
  notes: z.string().max(1000).optional(),
});

const integrityVerificationSchema = z.object({
  filePath: z.string().optional(),
});

// Upload evidence file with metadata
router.post('/upload',
  verifyToken,
  requirePermission(['evidence:create']),
  uploadRateLimiter,
  evidenceUpload.array('files', 10),
  handleUploadError,
  validateBody(fileUploadSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { caseId, title, description, type, location, tags } = req.body;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return sendError(res, 'No files uploaded', 400, 'NO_FILES');
    }

    try {
      // Check if case exists and user has access
      const caseItem = await prisma.case.findUnique({
        where: { id: caseId },
        select: { id: true, caseNumber: true },
      });

      if (!caseItem) {
        return sendError(res, 'Case not found', 404, 'CASE_NOT_FOUND');
      }

      // Get next evidence number for this case
      const lastEvidence = await prisma.evidenceItem.findFirst({
        where: { caseId },
        orderBy: { itemNumber: 'desc' },
        select: { itemNumber: true },
      });

      let nextSequence = 1;
      if (lastEvidence?.itemNumber) {
        const match = lastEvidence.itemNumber.match(/-E(\d+)$/);
        if (match) {
          nextSequence = parseInt(match[1], 10) + 1;
        }
      }

      const evidenceItems: Array<{
        id: string;
        itemNumber: string;
        title: string;
        filename: string;
        size: number;
        hash: string;
        processingStatus: string;
      }> = [];

      // Process each uploaded file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const itemNumber = generateEvidenceNumber(caseItem.caseNumber, nextSequence + i);

        // Calculate file hash
        const fileHash = crypto.createHash('sha256').update(file.buffer!).digest('hex');

        // Create evidence item
        const evidence = await prisma.$transaction(async (tx) => {
          // Create evidence item
          const newEvidence = await tx.evidenceItem.create({
            data: {
              caseId,
              itemNumber,
              title: files.length > 1 ? `${title} - File ${i + 1}` : title,
              description,
              type,
              location,
              collectedById: req.user!.id,
              collectedAt: new Date(),
              filePath: file.path,
              fileSize: BigInt(file.size),
              checksumSha256: fileHash,
              metadata: {
                originalFilename: file.originalname,
                mimetype: file.mimetype,
                uploadedAt: new Date().toISOString(),
                uploadedBy: req.user!.id,
              },
              chainOfCustody: [{
                action: 'UPLOADED',
                userId: req.user!.id,
                timestamp: new Date().toISOString(),
                location: location || 'System Upload',
                notes: `File uploaded: ${file.originalname}`,
                metadata: {
                  filename: file.filename,
                  size: file.size,
                  hash: fileHash,
                },
              }],
            },
          });

          // Create tags if provided
          if (tags && tags.length > 0) {
            const tagRecords = await Promise.all(
              tags.map(async (tagName: string) => {
                return await tx.tag.upsert({
                  where: { name: tagName.toLowerCase() },
                  update: {},
                  create: {
                    name: tagName.toLowerCase(),
                    color: '#' + Math.floor(Math.random()*16777215).toString(16),
                  },
                });
              })
            );

            // Link tags to evidence
            await Promise.all(
              tagRecords.map(async (tag) => {
                return await tx.evidenceTag.create({
                  data: {
                    evidenceId: newEvidence.id,
                    tagId: tag.id,
                  },
                });
              })
            );
          }

          return newEvidence;
        });

        // Queue file for background processing
        await FileProcessingWorker.addFileProcessingJob({
          evidenceId: evidence.id,
          filePath: file.path!,
          originalFilename: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          userId: req.user!.id,
          caseId,
        });

        evidenceItems.push({
          id: evidence.id,
          itemNumber: evidence.itemNumber,
          title: evidence.title,
          filename: file.originalname,
          size: file.size,
          hash: fileHash,
          processingStatus: 'queued',
        });

        logger.info('Evidence file uploaded', {
          evidenceId: evidence.id,
          caseId,
          filename: file.originalname,
          size: file.size,
          userId: req.user!.id,
          correlationId: req.correlationId,
        });
      }

      sendSuccess(res, {
        message: `Successfully uploaded ${files.length} file(s)`,
        evidenceItems,
        caseId,
      });
    } catch (error) {
      logger.error('Evidence upload failed', {
        error: error instanceof Error ? error.message : String(error),
        caseId,
        fileCount: files.length,
        userId: req.user!.id,
        correlationId: req.correlationId,
      });

      // Clean up uploaded files on error
      try {
        await Promise.all(files.map(file => fs.unlink(file.path!)));
      } catch (cleanupError) {
        logger.warn('Failed to cleanup uploaded files', {
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }

      return sendError(res, 'Evidence upload failed', 500, 'UPLOAD_FAILED');
    }
  })
);

// S3 direct upload with presigned URL
router.post('/upload/s3/presigned',
  verifyToken,
  requirePermission(['evidence:create']),
  uploadRateLimiter,
  validateBody(z.object({
    filename: z.string(),
    contentType: z.string(),
    size: z.number(),
  })),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { filename, contentType, size } = req.body;

    try {
      // Generate S3 key
      const timestamp = Date.now();
      const randomId = crypto.randomUUID();
      const extension = path.extname(filename);
      const key = `evidence/${new Date().getFullYear()}/${new Date().getMonth() + 1}/${timestamp}_${randomId}${extension}`;

      // Generate presigned URL
      const uploadUrl = await generatePresignedUrl(key, contentType, 3600); // 1 hour expiry

      sendSuccess(res, {
        uploadUrl,
        key,
        expiresIn: 3600,
        maxSize: 100 * 1024 * 1024, // 100MB
      });
    } catch (error) {
      logger.error('Failed to generate presigned URL', {
        error: error instanceof Error ? error.message : String(error),
        filename,
        userId: req.user!.id,
        correlationId: req.correlationId,
      });

      return sendError(res, 'Failed to generate upload URL', 500, 'PRESIGNED_URL_FAILED');
    }
  })
);

// Chunked file upload for large files
router.post('/upload/chunk',
  verifyToken,
  requirePermission(['evidence:create']),
  uploadRateLimiter,
  evidenceUpload.single('chunk'),
  handleUploadError,
  validateBody(chunkUploadSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { uploadId, chunkIndex, totalChunks, caseId, filename, totalSize } = req.body;
    const chunkFile = req.file as Express.Multer.File;

    if (!chunkFile) {
      return sendError(res, 'No chunk data provided', 400, 'NO_CHUNK_DATA');
    }

    try {
      // Handle chunk
      const result = await chunkedUploadManager.handleChunk(
        uploadId,
        parseInt(chunkIndex),
        parseInt(totalChunks),
        chunkFile.buffer!
      );

      if (result.complete && result.buffer) {
        // All chunks received, create evidence item
        const caseItem = await prisma.case.findUnique({
          where: { id: caseId },
          select: { caseNumber: true },
        });

        if (!caseItem) {
          return sendError(res, 'Case not found', 404, 'CASE_NOT_FOUND');
        }

        // Save complete file
        const completeFilename = `${Date.now()}_${filename}`;
        const completePath = path.join(process.env.UPLOAD_PATH || './uploads', completeFilename);
        await fs.writeFile(completePath, result.buffer);

        // Get next evidence number
        const lastEvidence = await prisma.evidenceItem.findFirst({
          where: { caseId },
          orderBy: { itemNumber: 'desc' },
          select: { itemNumber: true },
        });

        let nextSequence = 1;
        if (lastEvidence?.itemNumber) {
          const match = lastEvidence.itemNumber.match(/-E(\d+)$/);
          if (match) {
            nextSequence = parseInt(match[1], 10) + 1;
          }
        }

        const itemNumber = generateEvidenceNumber(caseItem.caseNumber, nextSequence);
        const fileHash = crypto.createHash('sha256').update(result.buffer).digest('hex');

        // Create evidence item
        const evidence = await prisma.evidenceItem.create({
          data: {
            caseId,
            itemNumber,
            title: filename,
            type: 'DIGITAL', // Default for chunked uploads
            collectedById: req.user!.id,
            collectedAt: new Date(),
            filePath: completePath,
            fileSize: BigInt(totalSize),
            checksumSha256: fileHash,
            metadata: {
              originalFilename: filename,
              uploadType: 'chunked',
              totalChunks: parseInt(totalChunks),
              uploadedAt: new Date().toISOString(),
              uploadedBy: req.user!.id,
            },
            chainOfCustody: [{
              action: 'UPLOADED',
              userId: req.user!.id,
              timestamp: new Date().toISOString(),
              location: 'System Upload',
              notes: `Chunked file upload completed: ${filename}`,
              metadata: {
                filename: completeFilename,
                size: totalSize,
                chunks: totalChunks,
                hash: fileHash,
              },
            }],
          },
        });

        // Queue for processing
        await FileProcessingWorker.addFileProcessingJob({
          evidenceId: evidence.id,
          filePath: completePath,
          originalFilename: filename,
          mimetype: 'application/octet-stream', // Will be detected during processing
          size: parseInt(totalSize),
          userId: req.user!.id,
          caseId,
        });

        sendSuccess(res, {
          complete: true,
          evidenceId: evidence.id,
          itemNumber: evidence.itemNumber,
          message: 'Chunked upload completed successfully',
        });
      } else {
        sendSuccess(res, {
          complete: false,
          uploadId,
          chunkIndex: parseInt(chunkIndex),
          totalChunks: parseInt(totalChunks),
          message: `Chunk ${parseInt(chunkIndex) + 1} of ${totalChunks} received`,
        });
      }

      // Clean up chunk file
      try {
        await fs.unlink(chunkFile.path!);
      } catch (error) {
        // Ignore cleanup errors
      }
    } catch (error) {
      logger.error('Chunked upload failed', {
        error: error instanceof Error ? error.message : String(error),
        uploadId,
        chunkIndex,
        totalChunks,
        userId: req.user!.id,
        correlationId: req.correlationId,
      });

      return sendError(res, 'Chunk upload failed', 500, 'CHUNK_UPLOAD_FAILED');
    }
  })
);

// Transfer custody of evidence
router.post('/:id/transfer',
  verifyToken,
  requirePermission(['evidence:transfer']),
  validateParams(z.object({ id: z.string().cuid() })),
  validateBody(custodyTransferSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: evidenceId } = req.params;
    const { toUserId, reason, location, approvalRequired, approvers, scheduledAt, notes } = req.body;

    try {
      // Verify evidence exists and user has access
      const evidence = await prisma.evidenceItem.findUnique({
        where: { id: evidenceId },
        include: {
          case: { select: { caseNumber: true } },
          collectedBy: { select: { email: true } },
        },
      });

      if (!evidence) {
        return sendError(res, 'Evidence not found', 404, 'EVIDENCE_NOT_FOUND');
      }

      // Check permissions
      const canTransfer = req.user!.roles.includes('admin') ||
                         req.user!.roles.includes('super_admin') ||
                         evidence.collectedById === req.user!.id ||
                         req.user!.permissions.includes('evidence:transfer');

      if (!canTransfer) {
        return sendError(res, 'Access denied', 403, 'ACCESS_DENIED');
      }

      // Create custody transfer request
      const transferId = await chainOfCustodyService.createCustodyTransfer({
        evidenceId,
        fromUserId: req.user!.id,
        toUserId,
        reason,
        location,
        approvalRequired,
        approvers,
        scheduledAt,
        notes,
      });

      sendSuccess(res, {
        transferId,
        status: approvalRequired ? 'pending_approval' : 'approved',
        message: 'Custody transfer request created',
      });
    } catch (error) {
      logger.error('Custody transfer creation failed', {
        error: error instanceof Error ? error.message : String(error),
        evidenceId,
        toUserId,
        userId: req.user!.id,
        correlationId: req.correlationId,
      });

      return sendError(res, 'Failed to create custody transfer', 500, 'TRANSFER_FAILED');
    }
  })
);

// Approve or reject custody transfer
router.post('/transfers/:transferId/:action',
  verifyToken,
  requirePermission(['evidence:approve']),
  validateParams(z.object({
    transferId: z.string().cuid(),
    action: z.enum(['approve', 'reject']),
  })),
  validateBody(z.object({
    notes: z.string().max(1000).optional(),
  })),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { transferId, action } = req.params;
    const { notes } = req.body;

    try {
      await chainOfCustodyService.approveCustodyTransfer(
        transferId,
        req.user!.id,
        action.toUpperCase() as 'APPROVED' | 'REJECTED',
        notes
      );

      sendSuccess(res, {
        transferId,
        action,
        message: `Custody transfer ${action}d successfully`,
      });
    } catch (error) {
      logger.error('Custody transfer approval failed', {
        error: error instanceof Error ? error.message : String(error),
        transferId,
        action,
        userId: req.user!.id,
        correlationId: req.correlationId,
      });

      return sendError(res, `Failed to ${action} custody transfer`, 500, 'APPROVAL_FAILED');
    }
  })
);

// Verify evidence integrity
router.post('/:id/verify',
  verifyToken,
  requirePermission(['evidence:verify']),
  validateParams(z.object({ id: z.string().cuid() })),
  validateBody(integrityVerificationSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: evidenceId } = req.params;
    const { filePath } = req.body;

    try {
      const evidence = await prisma.evidenceItem.findUnique({
        where: { id: evidenceId },
        select: { id: true, filePath: true },
      });

      if (!evidence) {
        return sendError(res, 'Evidence not found', 404, 'EVIDENCE_NOT_FOUND');
      }

      const actualFilePath = filePath || evidence.filePath;
      if (!actualFilePath) {
        return sendError(res, 'No file path available for verification', 400, 'NO_FILE_PATH');
      }

      const verificationResult = await chainOfCustodyService.verifyIntegrity(evidenceId, actualFilePath);

      sendSuccess(res, {
        verification: verificationResult,
        message: verificationResult.verified ? 'Evidence integrity verified' : 'Evidence integrity check failed',
      });
    } catch (error) {
      logger.error('Evidence integrity verification failed', {
        error: error instanceof Error ? error.message : String(error),
        evidenceId,
        userId: req.user!.id,
        correlationId: req.correlationId,
      });

      return sendError(res, 'Integrity verification failed', 500, 'VERIFICATION_FAILED');
    }
  })
);

// Get file processing status
router.get('/:id/processing-status',
  verifyToken,
  requirePermission(['evidence:read']),
  validateParams(z.object({ id: z.string().cuid() })),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: evidenceId } = req.params;

    try {
      const evidence = await prisma.evidenceItem.findUnique({
        where: { id: evidenceId },
        select: { metadata: true },
      });

      if (!evidence) {
        return sendError(res, 'Evidence not found', 404, 'EVIDENCE_NOT_FOUND');
      }

      const metadata = evidence.metadata as any;
      const processingStatus = metadata?.fileProcessing || { status: 'not_processed' };

      sendSuccess(res, {
        evidenceId,
        processing: processingStatus,
      });
    } catch (error) {
      logger.error('Failed to get processing status', {
        error: error instanceof Error ? error.message : String(error),
        evidenceId,
        userId: req.user!.id,
        correlationId: req.correlationId,
      });

      return sendError(res, 'Failed to get processing status', 500, 'STATUS_FAILED');
    }
  })
);

// Get job queue statistics
router.get('/jobs/stats',
  verifyToken,
  requirePermission(['admin']),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = await FileProcessingWorker.getJobStats();
      sendSuccess(res, { jobStats: stats });
    } catch (error) {
      logger.error('Failed to get job stats', {
        error: error instanceof Error ? error.message : String(error),
        userId: req.user!.id,
        correlationId: req.correlationId,
      });

      return sendError(res, 'Failed to get job statistics', 500, 'STATS_FAILED');
    }
  })
);

export default router;