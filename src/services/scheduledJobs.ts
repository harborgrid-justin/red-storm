import schedule from 'node-schedule';
import { fileProcessingQueue } from '../config/redis';
import { FileProcessingWorker } from '../services/backgroundJobs';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import fs from 'fs/promises';
import path from 'path';

// Scheduled job manager
export class ScheduledJobManager {
  private static instance: ScheduledJobManager;
  private jobs: Map<string, schedule.Job> = new Map();

  private constructor() {
    this.initializeJobs();
  }

  static getInstance(): ScheduledJobManager {
    if (!ScheduledJobManager.instance) {
      ScheduledJobManager.instance = new ScheduledJobManager();
    }
    return ScheduledJobManager.instance;
  }

  private initializeJobs(): void {
    // Clean up old temporary files daily at 2 AM
    const cleanupJob = schedule.scheduleJob('cleanup-temp-files', '0 2 * * *', async () => {
      await this.cleanupTempFiles();
    });
    this.jobs.set('cleanup-temp-files', cleanupJob);

    // Clean up old processed files weekly on Sundays at 3 AM
    const archiveJob = schedule.scheduleJob('archive-old-files', '0 3 * * 0', async () => {
      await this.archiveOldFiles();
    });
    this.jobs.set('archive-old-files', archiveJob);

    // Update database statistics daily at 1 AM
    const statsJob = schedule.scheduleJob('update-stats', '0 1 * * *', async () => {
      await this.updateDatabaseStatistics();
    });
    this.jobs.set('update-stats', statsJob);

    // Clean up failed queue jobs every hour
    const queueCleanupJob = schedule.scheduleJob('cleanup-failed-jobs', '0 * * * *', async () => {
      await this.cleanupFailedJobs();
    });
    this.jobs.set('cleanup-failed-jobs', queueCleanupJob);

    // Check file integrity randomly every 6 hours
    const integrityCheckJob = schedule.scheduleJob('integrity-check', '0 */6 * * *', async () => {
      await this.performRandomIntegrityChecks();
    });
    this.jobs.set('integrity-check', integrityCheckJob);

    // Generate daily processing reports at 6 AM
    const reportJob = schedule.scheduleJob('daily-report', '0 6 * * *', async () => {
      await this.generateDailyReport();
    });
    this.jobs.set('daily-report', reportJob);

    logger.info('Scheduled jobs initialized', {
      jobCount: this.jobs.size,
      jobs: Array.from(this.jobs.keys()),
    });
  }

  // Clean up temporary files older than 24 hours
  private async cleanupTempFiles(): Promise<void> {
    try {
      logger.info('Starting temporary file cleanup');

      const uploadsDir = process.env.UPLOAD_PATH || './uploads';
      const tempDir = path.join(uploadsDir, 'temp');
      
      // Check if temp directory exists
      try {
        await fs.access(tempDir);
      } catch {
        logger.info('Temp directory does not exist, skipping cleanup');
        return;
      }

      const files = await fs.readdir(tempDir);
      const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(tempDir, file);
        try {
          const stats = await fs.stat(filePath);
          if (stats.mtime.getTime() < twentyFourHoursAgo) {
            await fs.unlink(filePath);
            deletedCount++;
          }
        } catch (error) {
          logger.warn('Failed to process temp file', {
            file: filePath,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logger.info('Temporary file cleanup completed', {
        filesDeleted: deletedCount,
        totalFiles: files.length,
      });
    } catch (error) {
      logger.error('Temporary file cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Archive old processed files (older than 90 days) for archived cases
  private async archiveOldFiles(): Promise<void> {
    try {
      logger.info('Starting old file archival');

      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      // Queue cleanup job for old archived cases
      await FileProcessingWorker.addFileCleanupJob({
        olderThan: ninetyDaysAgo,
        types: ['DOCUMENT', 'PHOTO', 'VIDEO', 'AUDIO'],
      });

      logger.info('Old file archival job queued', {
        cutoffDate: ninetyDaysAgo.toISOString(),
      });
    } catch (error) {
      logger.error('Old file archival failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Update database statistics for performance optimization
  private async updateDatabaseStatistics(): Promise<void> {
    try {
      logger.info('Starting database statistics update');

      // Get basic statistics
      const [caseCount, evidenceCount, activeJobCount] = await Promise.all([
        prisma.case.count(),
        prisma.evidenceItem.count(),
        fileProcessingQueue.getActive().then(jobs => jobs.length),
      ]);

      // Get evidence statistics by type
      const evidenceByType = await prisma.evidenceItem.groupBy({
        by: ['type'],
        _count: {
          id: true,
        },
      });

      // Get case statistics by status
      const casesByStatus = await prisma.case.groupBy({
        by: ['status'],
        _count: {
          id: true,
        },
      });

      // Calculate file storage usage
      const fileStats = await prisma.evidenceItem.aggregate({
        _sum: {
          fileSize: true,
        },
        _count: {
          filePath: true,
        },
        where: {
          filePath: {
            not: null,
          },
        },
      });

      logger.info('Database statistics updated', {
        totalCases: caseCount,
        totalEvidence: evidenceCount,
        activeJobs: activeJobCount,
        evidenceByType,
        casesByStatus,
        fileStats: {
          totalFiles: fileStats._count.filePath,
          totalSize: fileStats._sum.fileSize?.toString() || '0',
        },
      });
    } catch (error) {
      logger.error('Database statistics update failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Clean up failed jobs from the queue
  private async cleanupFailedJobs(): Promise<void> {
    try {
      logger.info('Starting failed job cleanup');

      const failed = await fileProcessingQueue.getFailed();
      const oldFailedJobs = failed.filter(job => {
        const jobAge = Date.now() - job.timestamp;
        return jobAge > (24 * 60 * 60 * 1000); // Older than 24 hours
      });

      let cleanedCount = 0;
      for (const job of oldFailedJobs) {
        try {
          await job.remove();
          cleanedCount++;
        } catch (error) {
          logger.warn('Failed to remove old failed job', {
            jobId: job.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logger.info('Failed job cleanup completed', {
        totalFailed: failed.length,
        cleaned: cleanedCount,
      });
    } catch (error) {
      logger.error('Failed job cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Perform random integrity checks on evidence files
  private async performRandomIntegrityChecks(): Promise<void> {
    try {
      logger.info('Starting random integrity checks');

      // Get a random sample of evidence items with files
      const evidenceItems = await prisma.evidenceItem.findMany({
        where: {
          filePath: { not: null },
          checksumSha256: { not: null },
          isDeleted: false,
        },
        select: {
          id: true,
          filePath: true,
          checksumSha256: true,
          itemNumber: true,
        },
        take: 10, // Check 10 random files
        orderBy: {
          updatedAt: 'desc',
        },
      });

      let checkedCount = 0;
      let integrityFailures = 0;

      for (const evidence of evidenceItems) {
        try {
          if (!evidence.filePath || !evidence.checksumSha256) continue;

          // Check if file exists
          try {
            await fs.access(evidence.filePath);
          } catch {
            logger.warn('Evidence file not found', {
              evidenceId: evidence.id,
              filePath: evidence.filePath,
            });
            integrityFailures++;
            continue;
          }

          // Calculate current hash
          const fileBuffer = await fs.readFile(evidence.filePath);
          const crypto = require('crypto');
          const currentHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

          if (currentHash !== evidence.checksumSha256) {
            logger.error('Evidence file integrity check failed', {
              evidenceId: evidence.id,
              itemNumber: evidence.itemNumber,
              expectedHash: evidence.checksumSha256,
              actualHash: currentHash,
            });
            integrityFailures++;
          }

          checkedCount++;
        } catch (error) {
          logger.warn('Failed to check evidence integrity', {
            evidenceId: evidence.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logger.info('Random integrity checks completed', {
        filesChecked: checkedCount,
        integrityFailures,
        successRate: checkedCount > 0 ? ((checkedCount - integrityFailures) / checkedCount * 100).toFixed(1) + '%' : 'N/A',
      });
    } catch (error) {
      logger.error('Random integrity checks failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Generate daily processing report
  private async generateDailyReport(): Promise<void> {
    try {
      logger.info('Generating daily processing report');

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get yesterday's statistics
      const [evidenceCreated, processingJobs] = await Promise.all([
        prisma.evidenceItem.count({
          where: {
            createdAt: {
              gte: yesterday,
              lt: today,
            },
          },
        }),
        // Get job statistics from Redis (this would need to be implemented)
        // For now, we'll just get current queue stats
        fileProcessingQueue.getCompleted(),
      ]);

      const report = {
        date: yesterday.toISOString().split('T')[0],
        evidenceItemsCreated: evidenceCreated,
        jobsCompleted: processingJobs.length,
        timestamp: new Date().toISOString(),
      };

      logger.info('Daily processing report generated', report);

      // In a production system, this report could be:
      // 1. Saved to the database
      // 2. Sent via email to administrators
      // 3. Stored in a monitoring system
      // 4. Exported to a file
    } catch (error) {
      logger.error('Daily report generation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Get status of all scheduled jobs
  public getJobsStatus(): { [key: string]: any } {
    const status: { [key: string]: any } = {};

    for (const [name, job] of this.jobs) {
      status[name] = {
        name,
        nextInvocation: job.nextInvocation()?.toISOString(),
        running: false, // Job.running doesn't exist in node-schedule
      };
    }

    return status;
  }

  // Cancel a scheduled job
  public cancelJob(jobName: string): boolean {
    const job = this.jobs.get(jobName);
    if (job) {
      job.cancel();
      this.jobs.delete(jobName);
      logger.info('Scheduled job cancelled', { jobName });
      return true;
    }
    return false;
  }

  // Cancel all scheduled jobs
  public cancelAllJobs(): void {
    for (const [name, job] of this.jobs) {
      job.cancel();
    }
    this.jobs.clear();
    logger.info('All scheduled jobs cancelled');
  }

  // Add a custom scheduled job
  public addJob(
    name: string,
    cronPattern: string,
    callback: () => Promise<void>
  ): boolean {
    if (this.jobs.has(name)) {
      logger.warn('Job with name already exists', { name });
      return false;
    }

    try {
      const job = schedule.scheduleJob(name, cronPattern, async () => {
        try {
          logger.info('Executing scheduled job', { name });
          await callback();
          logger.info('Scheduled job completed', { name });
        } catch (error) {
          logger.error('Scheduled job failed', {
            name,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      this.jobs.set(name, job);
      logger.info('Custom scheduled job added', { name, cronPattern });
      return true;
    } catch (error) {
      logger.error('Failed to add scheduled job', {
        name,
        cronPattern,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

// Initialize scheduled job manager
export const scheduledJobManager = ScheduledJobManager.getInstance();

export default scheduledJobManager;