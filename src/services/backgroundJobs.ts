import { Job } from 'bull';
import { fileProcessingQueue } from '../config/redis';
import { fileProcessingService, FileMetadata } from './fileProcessing';
import { logger } from '../config/logger';
import { prisma } from '../config/database';
import { io } from '../app'; // WebSocket server
import { elasticsearchService } from './searchService';
import { ocrService } from './ocrService';
import { similaritySearchService } from './similaritySearchService';
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

export interface SearchIndexJobData {
  type: 'case' | 'evidence' | 'document';
  id: string;
  action: 'index' | 'update' | 'delete';
  data?: any;
}

export interface OCRProcessingJobData {
  evidenceFileId: string;
  filePath: string;
  mimetype: string;
  language?: string;
}

export interface SimilarityAnalysisJobData {
  evidenceId: string;
  analysisType: 'text' | 'image' | 'audio' | 'cross-correlation';
  threshold?: number;
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

    // Index documents for search
    fileProcessingQueue.process('index-document', 2, async (job: Job<SearchIndexJobData>) => {
      return await this.indexDocumentJob(job);
    });

    // Process OCR
    fileProcessingQueue.process('process-ocr', 1, async (job: Job<OCRProcessingJobData>) => {
      return await this.processOCRJob(job);
    });

    // Analyze similarity
    fileProcessingQueue.process('analyze-similarity', 1, async (job: Job<SimilarityAnalysisJobData>) => {
      return await this.analyzeSimilarityJob(job);
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

  // Search indexing job
  private async indexDocumentJob(job: Job<SearchIndexJobData>): Promise<void> {
    const { type, id, action, data } = job.data;

    try {
      await job.progress(10);

      switch (action) {
        case 'index':
        case 'update':
          await this.indexDocument(type, id, data);
          break;
        case 'delete':
          await elasticsearchService.deleteDocument(type + 's', id);
          break;
      }

      await job.progress(100);

      logger.info('Search indexing job completed', {
        type,
        id,
        action,
      });
    } catch (error) {
      logger.error('Search indexing job failed', {
        type,
        id,
        action,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async indexDocument(type: 'case' | 'evidence' | 'document', id: string, data?: any): Promise<void> {
    switch (type) {
      case 'case':
        await this.indexCase(id);
        break;
      case 'evidence':
        await this.indexEvidence(id);
        break;
      case 'document':
        await this.indexDocumentFile(id, data);
        break;
    }
  }

  private async indexCase(caseId: string): Promise<void> {
    const case_ = await prisma.case.findUnique({
      where: { id: caseId },
      include: {
        assignedTo: true,
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    if (!case_) {
      throw new Error(`Case ${caseId} not found`);
    }

    const document = {
      id: case_.id,
      type: 'case' as const,
      title: case_.title,
      description: case_.description || undefined,
      metadata: {
        caseNumber: case_.caseNumber,
      },
      status: case_.status,
      priority: case_.priority,
      assignedTo: case_.assignedTo?.id,
      tags: case_.tags.map(t => t.tag.name),
      createdAt: case_.createdAt,
      updatedAt: case_.updatedAt,
    };

    await elasticsearchService.indexDocument('cases', document);
  }

  private async indexEvidence(evidenceId: string): Promise<void> {
    const evidence = await prisma.evidenceItem.findUnique({
      where: { id: evidenceId },
      include: {
        case: true,
        tags: {
          include: {
            tag: true,
          },
        },
        collectedBy: true,
      },
    });

    if (!evidence) {
      throw new Error(`Evidence ${evidenceId} not found`);
    }

    // Extract text from metadata if available
    const metadata = evidence.metadata as any;
    const ocrText = metadata?.fileProcessing?.extractedText || '';
    const transcription = metadata?.transcription || '';

    const document = {
      id: evidence.id,
      type: 'evidence' as const,
      title: evidence.title,
      description: evidence.description || undefined,
      metadata: {
        evidenceType: evidence.type,
        location: evidence.location,
        collectedBy: evidence.collectedBy.email,
        collectedAt: evidence.collectedAt,
        chainOfCustody: evidence.chainOfCustody,
        itemNumber: evidence.itemNumber,
        fileMetadata: metadata?.fileProcessing,
      },
      caseId: evidence.caseId,
      status: evidence.status,
      tags: evidence.tags.map(t => t.tag.name),
      ocrText,
      transcription,
      createdAt: evidence.createdAt,
      updatedAt: evidence.updatedAt,
    };

    await elasticsearchService.indexDocument('evidence', document);
  }

  private async indexDocumentFile(evidenceId: string, additionalData?: any): Promise<void> {
    const evidence = await prisma.evidenceItem.findUnique({
      where: { id: evidenceId },
      include: {
        case: true,
      },
    });

    if (!evidence) {
      throw new Error(`Evidence ${evidenceId} not found`);
    }

    const metadata = evidence.metadata as any;
    const fileProcessing = metadata?.fileProcessing;

    if (!fileProcessing || !evidence.filePath) {
      // No file associated with this evidence
      return;
    }

    const document = {
      id: evidence.id,
      type: 'document' as const,
      title: fileProcessing.originalName || evidence.title,
      content: fileProcessing.extractedText || '',
      fileName: fileProcessing.originalName || 'unknown',
      mimeType: fileProcessing.mimetype || 'application/octet-stream',
      evidenceId: evidence.id,
      caseId: evidence.caseId,
      extractedText: fileProcessing.extractedText,
      metadata: {
        fileSize: evidence.fileSize?.toString(),
        hash: fileProcessing.hash || evidence.checksumSha256,
        uploadedAt: evidence.createdAt,
        processedAt: evidence.updatedAt,
        exif: fileProcessing.exif,
        dimensions: fileProcessing.dimensions,
        thumbnails: fileProcessing.thumbnails,
        ...additionalData,
      },
      createdAt: evidence.createdAt,
      updatedAt: evidence.updatedAt,
    };

    await elasticsearchService.indexDocument('documents', document);
  }

  // OCR processing job
  private async processOCRJob(job: Job<OCRProcessingJobData>): Promise<{ text: string; confidence: number }> {
    const { evidenceFileId, filePath, mimetype, language = 'eng' } = job.data;

    try {
      await job.progress(10);

      if (!OCRService.isImageFile(mimetype)) {
        throw new Error(`File type ${mimetype} is not suitable for OCR`);
      }

      await job.progress(20);

      // Initialize OCR service
      await ocrService.initialize();

      await job.progress(30);

      // Load language if different from default
      if (language !== 'eng') {
        await ocrService.loadLanguage(language);
      }

      await job.progress(40);

      // Process OCR
      const result = await ocrService.processImage(filePath, {
        language,
        preserve_interword_spaces: '1',
      });

      await job.progress(80);

      // Update evidence item with OCR results
      const evidence = await prisma.evidenceItem.findUnique({
        where: { id: evidenceFileId },
      });

      if (evidence) {
        const currentMetadata = (evidence.metadata as any) || {};
        const updatedMetadata = {
          ...currentMetadata,
          ocr: {
            text: result.text,
            confidence: result.confidence,
            metadata: {
              words: result.words.length,
              lines: result.lines.length,
              paragraphs: result.paragraphs.length,
              language,
            },
            processedAt: new Date(),
          },
        };

        await prisma.evidenceItem.update({
          where: { id: evidenceFileId },
          data: {
            metadata: updatedMetadata,
          },
        });
      }

      await job.progress(90);

      // Add search indexing job for the updated document
      await FileProcessingWorker.addSearchIndexJob({
        type: 'document',
        id: evidenceFileId,
        action: 'update',
      });

      await job.progress(100);

      logger.info('OCR processing completed', {
        evidenceFileId,
        textLength: result.text.length,
        confidence: result.confidence,
        language,
      });

      return {
        text: result.text,
        confidence: result.confidence,
      };
    } catch (error) {
      logger.error('OCR processing job failed', {
        evidenceFileId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // Similarity analysis job
  private async analyzeSimilarityJob(job: Job<SimilarityAnalysisJobData>): Promise<any> {
    const { evidenceId, analysisType, threshold = 0.5 } = job.data;

    try {
      await job.progress(10);

      const evidence = await prisma.evidenceItem.findUnique({
        where: { id: evidenceId },
      });

      if (!evidence) {
        throw new Error(`Evidence ${evidenceId} not found`);
      }

      await job.progress(20);

      let results: any = {};

      switch (analysisType) {
        case 'text':
          results = await this.analyzeTextSimilarity(evidence);
          break;
        case 'image':
          results = await this.analyzeImageSimilarity(evidence);
          break;
        case 'audio':
          results = await this.analyzeAudioSimilarity(evidence);
          break;
        case 'cross-correlation':
          results = await similaritySearchService.findCrossCorrelations(evidenceId, threshold);
          break;
      }

      await job.progress(80);

      // Store results in database
      await prisma.evidenceItem.update({
        where: { id: evidenceId },
        data: {
          metadata: {
            ...(evidence.metadata as any),
            similarityAnalysis: {
              ...(evidence.metadata as any)?.similarityAnalysis,
              [analysisType]: {
                results,
                analyzedAt: new Date(),
                threshold,
              },
            },
          },
        },
      });

      await job.progress(100);

      logger.info('Similarity analysis completed', {
        evidenceId,
        analysisType,
        resultsCount: Array.isArray(results) ? results.length : Object.keys(results).length,
      });

      return results;
    } catch (error) {
      logger.error('Similarity analysis job failed', {
        evidenceId,
        analysisType,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async analyzeTextSimilarity(evidence: any): Promise<any> {
    const metadata = evidence.metadata as any;
    const extractedText = metadata?.fileProcessing?.extractedText || '';
    const ocrText = metadata?.ocr?.text || '';
    const transcription = metadata?.transcription || '';
    
    const textContent = [extractedText, ocrText, transcription]
      .filter(Boolean)
      .join(' ');

    if (!textContent.trim()) {
      return { message: 'No text content found for analysis' };
    }

    return await similaritySearchService.findSimilarText(textContent, {
      threshold: 0.3,
      maxResults: 10,
    });
  }

  private async analyzeImageSimilarity(evidence: any): Promise<any> {
    const metadata = evidence.metadata as any;
    const mimeType = metadata?.fileProcessing?.mimetype;
    
    if (!mimeType?.startsWith('image/') || !evidence.filePath) {
      return { message: 'No image files found for analysis' };
    }

    try {
      const similarities = await similaritySearchService.findSimilarImages(evidence.filePath, {
        threshold: 0.7,
        maxResults: 5,
      });
      
      return [{
        evidenceId: evidence.id,
        fileName: metadata?.fileProcessing?.originalName || evidence.title,
        similarities,
      }];
    } catch (error) {
      logger.warn('Image similarity analysis failed', {
        evidenceId: evidence.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return { message: 'Image similarity analysis failed', error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async analyzeAudioSimilarity(evidence: any): Promise<any> {
    const metadata = evidence.metadata as any;
    const mimeType = metadata?.fileProcessing?.mimetype;
    
    if (!mimeType?.startsWith('audio/') || !evidence.filePath) {
      return { message: 'No audio files found for analysis' };
    }

    try {
      const similarities = await similaritySearchService.findSimilarAudio(evidence.filePath, 0.7, 5);
      
      return [{
        evidenceId: evidence.id,
        fileName: metadata?.fileProcessing?.originalName || evidence.title,
        similarities,
      }];
    } catch (error) {
      logger.warn('Audio similarity analysis failed', {
        evidenceId: evidence.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return { message: 'Audio similarity analysis failed', error: error instanceof Error ? error.message : String(error) };
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

  // Add search indexing job to queue
  static async addSearchIndexJob(
    data: SearchIndexJobData,
    options?: {
      delay?: number;
      priority?: number;
    }
  ): Promise<Job<SearchIndexJobData>> {
    return fileProcessingQueue.add('index-document', data, {
      attempts: 2,
      delay: options?.delay || 0,
      priority: options?.priority || 3,
      backoff: {
        type: 'fixed',
        delay: 3000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    });
  }

  // Add OCR processing job to queue
  static async addOCRJob(
    data: OCRProcessingJobData,
    options?: {
      delay?: number;
      priority?: number;
    }
  ): Promise<Job<OCRProcessingJobData>> {
    return fileProcessingQueue.add('process-ocr', data, {
      attempts: 2,
      delay: options?.delay || 0,
      priority: options?.priority || 2,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: 50,
      removeOnFail: 100,
    });
  }

  // Add similarity analysis job to queue
  static async addSimilarityAnalysisJob(
    data: SimilarityAnalysisJobData,
    options?: {
      delay?: number;
      priority?: number;
    }
  ): Promise<Job<SimilarityAnalysisJobData>> {
    return fileProcessingQueue.add('analyze-similarity', data, {
      attempts: 2,
      delay: options?.delay || 0,
      priority: options?.priority || 1, // Lower priority for analysis
      backoff: {
        type: 'exponential',
        delay: 10000,
      },
      removeOnComplete: 30,
      removeOnFail: 50,
    });
  }
}

// Initialize worker
export const fileProcessingWorker = FileProcessingWorker.getInstance();

export default fileProcessingWorker;