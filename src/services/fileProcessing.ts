import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import ExifReader from 'exifreader';
import ffmpeg from 'fluent-ffmpeg';
import pdfParse from 'pdf-parse';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import ClamScan from 'clamscan';
import { logger } from '../config/logger';

// File metadata interface
export interface FileMetadata {
  filename: string;
  originalName: string;
  size: number;
  mimetype: string;
  hash: string;
  uploadTime: Date;
  processing: {
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    startTime?: Date;
    endTime?: Date;
    errors?: string[];
  };
  exif?: any;
  dimensions?: {
    width: number;
    height: number;
  };
  duration?: number; // For video/audio files
  pages?: number; // For PDF files
  thumbnails?: string[];
  extractedText?: string;
  virusScan?: {
    clean: boolean;
    scanTime: Date;
    engine: string;
    threats?: string[];
  };
  lawEnforcementData?: {
    caseNumber?: string;
    evidenceType?: string;
    chainOfCustody?: any[];
    forensicHash?: string;
    acquisitionTool?: string;
  };
}

// File processing service
export class FileProcessingService {
  private clamScan?: ClamScan;

  constructor() {
    this.initializeClamAV();
  }

  private async initializeClamAV(): Promise<void> {
    try {
      this.clamScan = new ClamScan({
        removeInfected: false, // Don't automatically remove infected files
        quarantineInfected: false, // Don't quarantine infected files
        scanLog: null,
        debugMode: false,
        fileList: null,
        scanRecursively: true,
        clamscan: {
          path: '/usr/bin/clamscan',
          scanArchives: true,
          db: null,
        },
        clamdscan: {
          socket: '/var/run/clamav/clamd.sock',
          host: false,
          port: false,
        },
        preference: 'clamdscan',
      });

      await this.clamScan.getVersion();
      logger.info('ClamAV initialized successfully');
    } catch (error) {
      logger.warn('ClamAV initialization failed, virus scanning disabled', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.clamScan = undefined;
    }
  }

  // Calculate file hash for duplicate detection
  async calculateFileHash(buffer: Buffer): Promise<string> {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  // Perform virus scan
  async scanForViruses(filePath: string): Promise<FileMetadata['virusScan']> {
    if (!this.clamScan) {
      logger.warn('ClamAV not available, skipping virus scan');
      return {
        clean: true, // Assume clean if scanner not available
        scanTime: new Date(),
        engine: 'none',
      };
    }

    try {
      const result = await this.clamScan.scanFile(filePath);
      
      return {
        clean: result.isInfected === false,
        scanTime: new Date(),
        engine: 'ClamAV',
        threats: result.isInfected ? [result.viruses?.join(', ') || 'Unknown threat'] : undefined,
      };
    } catch (error) {
      logger.error('Virus scan failed', {
        error: error instanceof Error ? error.message : String(error),
        filePath,
      });

      return {
        clean: false, // Err on the side of caution
        scanTime: new Date(),
        engine: 'ClamAV',
        threats: ['Scan failed'],
      };
    }
  }

  // Extract EXIF data from images
  async extractExifData(buffer: Buffer): Promise<any> {
    try {
      const tags = ExifReader.load(buffer);
      const exifData: any = {};

      // Extract relevant EXIF data
      if (tags.DateTime?.description) {
        exifData.dateTime = tags.DateTime.description;
      }
      
      if (tags.GPS) {
        exifData.gps = {};
        if (tags.GPSLatitude && tags.GPSLongitude) {
          exifData.gps.latitude = this.convertGPSToDecimal(
            tags.GPSLatitude.description,
            tags.GPSLatitudeRef?.description || 'N'
          );
          exifData.gps.longitude = this.convertGPSToDecimal(
            tags.GPSLongitude.description,
            tags.GPSLongitudeRef?.description || 'E'
          );
        }
        if (tags.GPSAltitude?.description) {
          exifData.gps.altitude = parseFloat(tags.GPSAltitude.description);
        }
      }

      if (tags.Make?.description) {
        exifData.camera = {
          make: tags.Make.description,
          model: tags.Model?.description,
          software: tags.Software?.description,
        };
      }

      if (tags.ImageWidth?.description && tags.ImageHeight?.description) {
        exifData.dimensions = {
          width: parseInt(tags.ImageWidth.description, 10),
          height: parseInt(tags.ImageHeight.description, 10),
        };
      }

      return exifData;
    } catch (error) {
      logger.error('EXIF extraction failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private convertGPSToDecimal(coordinate: string, ref: string): number {
    if (!coordinate || !ref) return 0;

    try {
      // Parse DMS (Degrees, Minutes, Seconds) format
      const parts = coordinate.match(/(\d+)°\s*(\d+)'\s*(\d+(?:\.\d+)?)"?/);
      if (!parts) return 0;

      const degrees = parseInt(parts[1], 10);
      const minutes = parseInt(parts[2], 10);
      const seconds = parseFloat(parts[3]);

      let decimal = degrees + minutes / 60 + seconds / 3600;

      // Apply hemisphere reference
      if (ref === 'S' || ref === 'W') {
        decimal = -decimal;
      }

      return decimal;
    } catch (error) {
      logger.error('GPS coordinate conversion failed', {
        coordinate,
        ref,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  // Process images with Sharp
  async processImage(buffer: Buffer, outputDir: string, filename: string): Promise<{
    dimensions: { width: number; height: number };
    thumbnails: string[];
  }> {
    try {
      const image = sharp(buffer);
      const metadata = await image.metadata();

      const dimensions = {
        width: metadata.width || 0,
        height: metadata.height || 0,
      };

      // Generate thumbnails
      const thumbnails: string[] = [];
      const thumbnailSizes = [150, 300, 800];

      for (const size of thumbnailSizes) {
        const thumbnailFilename = `${path.parse(filename).name}_thumb_${size}${path.parse(filename).ext}`;
        const thumbnailPath = path.join(outputDir, thumbnailFilename);

        await image
          .resize(size, size, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toFile(thumbnailPath);

        thumbnails.push(thumbnailFilename);
      }

      return { dimensions, thumbnails };
    } catch (error) {
      logger.error('Image processing failed', {
        error: error instanceof Error ? error.message : String(error),
        filename,
      });
      throw error;
    }
  }

  // Extract video/audio metadata and generate thumbnails
  async processMedia(filePath: string, outputDir: string, filename: string): Promise<{
    duration: number;
    dimensions?: { width: number; height: number };
    thumbnails?: string[];
  }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          logger.error('Media probe failed', {
            error: err.message,
            filePath,
          });
          return reject(err);
        }

        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        const duration = metadata.format.duration || 0;

        const result: any = { duration };

        if (videoStream) {
          result.dimensions = {
            width: videoStream.width || 0,
            height: videoStream.height || 0,
          };

          // Generate video thumbnails
          const thumbnailFilename = `${path.parse(filename).name}_thumb.jpg`;
          const thumbnailPath = path.join(outputDir, thumbnailFilename);

          ffmpeg(filePath)
            .screenshots({
              count: 1,
              folder: outputDir,
              filename: thumbnailFilename,
              timemarks: ['10%'], // Take screenshot at 10% of video duration
            })
            .on('end', () => {
              result.thumbnails = [thumbnailFilename];
              resolve(result);
            })
            .on('error', (thumbnailErr) => {
              logger.warn('Video thumbnail generation failed', {
                error: thumbnailErr.message,
                filePath,
              });
              resolve(result); // Continue without thumbnails
            });
        } else {
          resolve(result);
        }
      });
    });
  }

  // Extract PDF content and metadata
  async processPDF(buffer: Buffer): Promise<{
    pages: number;
    extractedText: string;
    metadata: any;
  }> {
    try {
      const data = await pdfParse(buffer);
      
      return {
        pages: data.numpages,
        extractedText: data.text,
        metadata: data.info,
      };
    } catch (error) {
      logger.error('PDF processing failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // Check for duplicate files
  async checkForDuplicates(hash: string): Promise<boolean> {
    // This would typically query the database for existing files with the same hash
    // For now, return false (no duplicates found)
    // TODO: Implement database query for duplicate detection
    return false;
  }

  // Main processing method
  async processFile(
    filePath: string,
    buffer: Buffer,
    metadata: Partial<FileMetadata>
  ): Promise<FileMetadata> {
    const startTime = new Date();
    const outputDir = path.dirname(filePath);

    try {
      // Initialize metadata
      const fileMetadata: FileMetadata = {
        filename: metadata.filename || path.basename(filePath),
        originalName: metadata.originalName || path.basename(filePath),
        size: buffer.length,
        mimetype: metadata.mimetype || 'application/octet-stream',
        hash: await this.calculateFileHash(buffer),
        uploadTime: metadata.uploadTime || new Date(),
        processing: {
          status: 'processing',
          progress: 0,
          startTime,
        },
      };

      // Virus scan
      fileMetadata.processing.progress = 10;
      fileMetadata.virusScan = await this.scanForViruses(filePath);

      if (fileMetadata.virusScan && !fileMetadata.virusScan.clean) {
        fileMetadata.processing.status = 'failed';
        fileMetadata.processing.errors = fileMetadata.virusScan.threats;
        throw new Error(`File failed virus scan: ${fileMetadata.virusScan.threats?.join(', ')}`);
      }

      // Check for duplicates
      fileMetadata.processing.progress = 20;
      const isDuplicate = await this.checkForDuplicates(fileMetadata.hash);
      if (isDuplicate) {
        logger.warn('Duplicate file detected', {
          filename: fileMetadata.filename,
          hash: fileMetadata.hash,
        });
      }

      // Process based on file type
      const fileType = await fileTypeFromBuffer(buffer);
      fileMetadata.processing.progress = 30;

      if (fileType?.mime.startsWith('image/')) {
        // Image processing
        fileMetadata.exif = await this.extractExifData(buffer);
        const imageResult = await this.processImage(buffer, outputDir, fileMetadata.filename);
        fileMetadata.dimensions = imageResult.dimensions;
        fileMetadata.thumbnails = imageResult.thumbnails;
        fileMetadata.processing.progress = 80;
      } else if (fileType?.mime.startsWith('video/') || fileType?.mime.startsWith('audio/')) {
        // Media processing
        const mediaResult = await this.processMedia(filePath, outputDir, fileMetadata.filename);
        fileMetadata.duration = mediaResult.duration;
        fileMetadata.dimensions = mediaResult.dimensions;
        fileMetadata.thumbnails = mediaResult.thumbnails;
        fileMetadata.processing.progress = 80;
      } else if (fileType?.mime === 'application/pdf') {
        // PDF processing
        const pdfResult = await this.processPDF(buffer);
        fileMetadata.pages = pdfResult.pages;
        fileMetadata.extractedText = pdfResult.extractedText;
        fileMetadata.processing.progress = 80;
      }

      // Complete processing
      fileMetadata.processing.status = 'completed';
      fileMetadata.processing.progress = 100;
      fileMetadata.processing.endTime = new Date();

      logger.info('File processing completed', {
        filename: fileMetadata.filename,
        processingTime: fileMetadata.processing.endTime.getTime() - startTime.getTime(),
        size: fileMetadata.size,
        mimetype: fileMetadata.mimetype,
      });

      return fileMetadata;
    } catch (error) {
      logger.error('File processing failed', {
        filename: metadata.filename,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        ...metadata,
        processing: {
          status: 'failed',
          progress: 0,
          startTime,
          endTime: new Date(),
          errors: [error instanceof Error ? error.message : String(error)],
        },
      } as FileMetadata;
    }
  }

  // Parse law enforcement specific formats
  async parseLawEnforcementData(buffer: Buffer, mimetype: string): Promise<any> {
    // Placeholder for law enforcement specific format parsing
    // This would include parsers for formats like:
    // - UFED (Cellebrite) exports
    // - EnCase evidence files
    // - FTK reports
    // - Mobile forensics reports
    
    return {
      acquisitionTool: 'unknown',
      forensicHash: crypto.createHash('sha256').update(buffer).digest('hex'),
      extractedMetadata: {},
    };
  }
}

export const fileProcessingService = new FileProcessingService();

export default fileProcessingService;