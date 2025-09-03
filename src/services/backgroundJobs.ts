import { Job } from 'bull';
import { fileProcessingQueue } from '../config/redis';
import { fileProcessingService, FileMetadata } from './fileProcessing';
import { logger } from '../config/logger';
import { prisma } from '../config/database';
import { io } from '../app'; // WebSocket server
import fs from 'fs/promises';

// Background job data interfaces
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

// File processing worker
export class FileProcessingWorker {
  private static instance: FileProcessingWorker;

  private constructor() {
    this.setupJobProcessors();
  }

  static getInstance(): FileProcessingWorker {
    if (!FileProcessingWorker.instance) {
      FileProcessingWorker.instance = new FileProcessingWorker();
    }
    return FileProcessingWorker.instance;
  }

  private setupJobProcessors(): void {
    // Process uploaded files
    fileProcessingQueue.process('process-file', 3, async (job: Job<FileProcessingJobData>) => {
      return await this.processFileJob(job);
    });

    // Update chain of custody
    fileProcessingQueue.process('update-custody', 5, async (job: Job<ChainOfCustodyJobData>) => {
      return await this.updateChainOfCustodyJob(job);
    });

    // Clean up old files
    fileProcessingQueue.process('cleanup-files', 1, async (job: Job<FileCleanupJobData>) => {
      return await this.cleanupFilesJob(job);
    });

    // Handle job events
    this.setupJobEventHandlers();
  }

  private setupJobEventHandlers(): void {
    fileProcessingQueue.on('completed', (job, result) => {
      logger.info('Job completed', {
        jobId: job.id,
        type: job.name,
        result,
      });
    });

    fileProcessingQueue.on('failed', (job, err) => {
      logger.error('Job failed', {
        jobId: job?.id,
        type: job?.name,
        error: err.message,
        stack: err.stack,
      });
    });

    fileProcessingQueue.on('progress', (job, progress) => {
      // Emit progress updates via WebSocket
      if (io) {
        io.emit('job-progress', {
          jobId: job.id,
          type: job.name,
          progress,
          data: job.data,
        });
      }
    });

    fileProcessingQueue.on('stalled', (job) => {
      logger.warn('Job stalled', {
        jobId: job.id,
        type: job.name,
      });
    });
  }

  // Process file upload job
  private async processFileJob(job: Job<FileProcessingJobData>): Promise<FileMetadata> {
    const { evidenceId, filePath, originalFilename, mimetype, size, userId, caseId } = job.data;

    try {
      // Update job progress
      await job.progress(5);

      // Read file buffer
      const buffer = await fs.readFile(filePath);
      
      await job.progress(10);

      // Process file
      const metadata = await fileProcessingService.processFile(filePath, buffer, {
        filename: filePath.split('/').pop() || originalFilename,
        originalName: originalFilename,
        mimetype,
        size,
        uploadTime: new Date(),
      });

      await job.progress(60);

      // Update evidence record in database
      await prisma.evidenceItem.update({
        where: { id: evidenceId },
        data: {
          metadata: {
            ...metadata,
            fileProcessing: {
              status: metadata.processing.status,
              processingTime: metadata.processing.endTime 
                ? metadata.processing.endTime.getTime() - metadata.processing.startTime!.getTime()
                : null,
              hash: metadata.hash,
              virusScan: metadata.virusScan,
              thumbnails: metadata.thumbnails,
              extractedText: metadata.extractedText,
            },
          },
        },
      });

      await job.progress(80);

      // Add chain of custody entry for file processing
      await this.addChainOfCustodyEntry(evidenceId, 'FILE_PROCESSED', userId, {
        processingStatus: metadata.processing.status,
        fileHash: metadata.hash,
        virusScanResult: metadata.virusScan?.clean ? 'CLEAN' : 'INFECTED',
        processingTime: metadata.processing.endTime?.getTime(),
      });

      await job.progress(90);

      // Emit file processing completion
      if (io) {
        io.to(`case-${caseId}`).emit('evidence-file-processed', {
          evidenceId,
          metadata,
          status: 'completed',
        });
      }

      await job.progress(100);

      logger.info('File processing job completed', {
        evidenceId,
        originalFilename,
        processingTime: metadata.processing.endTime 
          ? metadata.processing.endTime.getTime() - metadata.processing.startTime!.getTime()
          : null,
        status: metadata.processing.status,
      });

      return metadata;
    } catch (error) {
      logger.error('File processing job failed', {
        evidenceId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Update evidence with error status
      await prisma.evidenceItem.update({
        where: { id: evidenceId },
        data: {
          metadata: {
            fileProcessing: {
              status: 'failed',
              error: error instanceof Error ? error.message : String(error),
              processingTime: Date.now(),
            },
          },
        },
      }).catch(dbError => {
        logger.error('Failed to update evidence with error status', {
          evidenceId,
          dbError: dbError instanceof Error ? dbError.message : String(dbError),
        });
      });

      // Emit error notification
      if (io) {
        io.to(`case-${caseId}`).emit('evidence-file-processed', {
          evidenceId,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }

      throw error;
    }
  }

  // Update chain of custody job
  private async updateChainOfCustodyJob(job: Job<ChainOfCustodyJobData>): Promise<void> {
    const { evidenceId, action, userId, location, notes, metadata } = job.data;

    try {
      await job.progress(25);

      await this.addChainOfCustodyEntry(evidenceId, action, userId, metadata, location, notes);

      await job.progress(75);

      // Get case ID for WebSocket notification
      const evidence = await prisma.evidenceItem.findUnique({
        where: { id: evidenceId },
        select: { caseId: true },
      });

      if (evidence && io) {
        io.to(`case-${evidence.caseId}`).emit('chain-of-custody-updated', {
          evidenceId,
          action,
          userId,
          timestamp: new Date(),
          metadata,
        });
      }

      await job.progress(100);

      logger.info('Chain of custody updated', {
        evidenceId,
        action,
        userId,
      });
    } catch (error) {
      logger.error('Chain of custody update failed', {
        evidenceId,
        action,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // File cleanup job
  private async cleanupFilesJob(job: Job<FileCleanupJobData>): Promise<{ deletedFiles: number }> {
    const { olderThan, types } = job.data;
    let deletedFiles = 0;

    try {
      await job.progress(10);

      // Find old evidence files to clean up
      const oldEvidence = await prisma.evidenceItem.findMany({
        where: {
          createdAt: { lt: olderThan },
          status: 'ARCHIVED' as any,
          type: { in: types as any },
        },
        select: {
          id: true,
          metadata: true,
        },
      });

      await job.progress(30);

      for (let i = 0; i < oldEvidence.length; i++) {
        const evidence = oldEvidence[i];
        const metadata = evidence.metadata as any;

        if (metadata?.fileProcessing?.thumbnails) {
          // Clean up thumbnails
          for (const thumbnail of metadata.fileProcessing.thumbnails) {
            try {
              await fs.unlink(thumbnail);
              deletedFiles++;
            } catch (error) {
              logger.warn('Failed to delete thumbnail', {
                thumbnail,
                evidenceId: evidence.id,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }

        // Update progress
        await job.progress(30 + (i / oldEvidence.length) * 60);
      }

      await job.progress(100);

      logger.info('File cleanup completed', {
        olderThan,
        types,
        deletedFiles,
      });

      return { deletedFiles };
    } catch (error) {
      logger.error('File cleanup job failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // Helper method to add chain of custody entry
  private async addChainOfCustodyEntry(
    evidenceId: string,
    action: string,
    userId: string,
    metadata?: any,
    location?: string,
    notes?: string
  ): Promise<void> {
    const evidence = await prisma.evidenceItem.findUnique({
      where: { id: evidenceId },
      select: { chainOfCustody: true },
    });

    if (!evidence) {
      throw new Error(`Evidence ${evidenceId} not found`);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true },
    });

    const custodyEntry = {
      action,
      userId,
      timestamp: new Date().toISOString(),
      location: location || 'System',
      notes: notes || `${action.replace('_', ' ').toLowerCase()} by ${user?.email || 'Unknown User'}`,
      metadata,
    };

    const updatedChainOfCustody = [
      ...(evidence.chainOfCustody as any[]),
      custodyEntry,
    ];

    await prisma.evidenceItem.update({
      where: { id: evidenceId },
      data: {
        chainOfCustody: updatedChainOfCustody,
      },
    });
  }

  // Add file processing job to queue
  static async addFileProcessingJob(
    data: FileProcessingJobData,
    options?: {
      delay?: number;
      attempts?: number;
      priority?: number;
    }
  ): Promise<Job<FileProcessingJobData>> {
    return fileProcessingQueue.add('process-file', data, {
      attempts: options?.attempts || 3,
      delay: options?.delay || 0,
      priority: options?.priority || 0,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: 50,
      removeOnFail: 100,
    });
  }

  // Add chain of custody update job to queue
  static async addChainOfCustodyJob(
    data: ChainOfCustodyJobData,
    options?: {
      delay?: number;
      priority?: number;
    }
  ): Promise<Job<ChainOfCustodyJobData>> {
    return fileProcessingQueue.add('update-custody', data, {
      attempts: 2,
      delay: options?.delay || 0,
      priority: options?.priority || 5, // Higher priority for custody updates
      backoff: {
        type: 'fixed',
        delay: 2000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    });
  }

  // Add file cleanup job to queue
  static async addFileCleanupJob(
    data: FileCleanupJobData,
    options?: {
      delay?: number;
    }
  ): Promise<Job<FileCleanupJobData>> {
    return fileProcessingQueue.add('cleanup-files', data, {
      attempts: 2,
      delay: options?.delay || 0,
      priority: -1, // Lower priority for cleanup jobs
      backoff: {
        type: 'fixed',
        delay: 10000,
      },
      removeOnComplete: 10,
      removeOnFail: 20,
    });
  }

  // Get job statistics
  static async getJobStats() {
    const waiting = await fileProcessingQueue.getWaiting();
    const active = await fileProcessingQueue.getActive();
    const completed = await fileProcessingQueue.getCompleted();
    const failed = await fileProcessingQueue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length,
    };
  }
}

// Initialize worker
export const fileProcessingWorker = FileProcessingWorker.getInstance();

export default fileProcessingWorker;