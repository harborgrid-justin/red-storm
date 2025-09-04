import { createWorker, Worker } from 'tesseract.js';
import { logger } from '@/config/logger';
import path from 'path';
import fs from 'fs/promises';

export interface OCROptions {
  language?: string;
  whitelist?: string;
  blacklist?: string;
  tessedit_char_whitelist?: string;
  tessedit_char_blacklist?: string;
  preserve_interword_spaces?: string;
}

export interface OCRResult {
  text: string;
  confidence: number;
  words: Array<{
    text: string;
    confidence: number;
    bbox: {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    };
  }>;
  lines: Array<{
    text: string;
    confidence: number;
    bbox: {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    };
  }>;
  paragraphs: Array<{
    text: string;
    confidence: number;
    bbox: {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    };
  }>;
}

export class OCRService {
  private worker: Worker | null = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.worker = await createWorker();
      await this.worker.loadLanguage('eng');
      await this.worker.initialize('eng');
      
      this.isInitialized = true;
      logger.info('OCR service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize OCR service', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async processImage(imagePath: string, options: OCROptions = {}): Promise<OCRResult> {
    await this.initialize();
    
    if (!this.worker) {
      throw new Error('OCR worker not initialized');
    }

    try {
      // Check if file exists
      await fs.access(imagePath);

      // Set parameters if provided
      if (options.tessedit_char_whitelist) {
        await this.worker.setParameters({
          tessedit_char_whitelist: options.tessedit_char_whitelist,
        });
      }

      if (options.tessedit_char_blacklist) {
        await this.worker.setParameters({
          tessedit_char_blacklist: options.tessedit_char_blacklist,
        });
      }

      if (options.preserve_interword_spaces) {
        await this.worker.setParameters({
          preserve_interword_spaces: options.preserve_interword_spaces,
        });
      }

      // Perform OCR
      const { data } = await this.worker.recognize(imagePath);

      const result: OCRResult = {
        text: data.text,
        confidence: data.confidence,
        words: data.words.map(word => ({
          text: word.text,
          confidence: word.confidence,
          bbox: {
            x0: word.bbox.x0,
            y0: word.bbox.y0,
            x1: word.bbox.x1,
            y1: word.bbox.y1,
          },
        })),
        lines: data.lines.map(line => ({
          text: line.text,
          confidence: line.confidence,
          bbox: {
            x0: line.bbox.x0,
            y0: line.bbox.y0,
            x1: line.bbox.x1,
            y1: line.bbox.y1,
          },
        })),
        paragraphs: data.paragraphs.map(paragraph => ({
          text: paragraph.text,
          confidence: paragraph.confidence,
          bbox: {
            x0: paragraph.bbox.x0,
            y0: paragraph.bbox.y0,
            x1: paragraph.bbox.x1,
            y1: paragraph.bbox.y1,
          },
        })),
      };

      logger.info('OCR processing completed', {
        imagePath: path.basename(imagePath),
        confidence: result.confidence,
        textLength: result.text.length,
      });

      return result;
    } catch (error) {
      logger.error('OCR processing failed', {
        error: error instanceof Error ? error.message : String(error),
        imagePath,
      });
      throw error;
    }
  }

  async processMultipleImages(imagePaths: string[], options: OCROptions = {}): Promise<OCRResult[]> {
    const results: OCRResult[] = [];

    for (const imagePath of imagePaths) {
      try {
        const result = await this.processImage(imagePath, options);
        results.push(result);
      } catch (error) {
        logger.error('Failed to process image in batch', {
          error: error instanceof Error ? error.message : String(error),
          imagePath,
        });
        // Continue with other images even if one fails
        results.push({
          text: '',
          confidence: 0,
          words: [],
          lines: [],
          paragraphs: [],
        });
      }
    }

    return results;
  }

  async combineResults(results: OCRResult[]): Promise<string> {
    return results
      .filter(result => result.text.trim().length > 0)
      .map(result => result.text.trim())
      .join('\n\n');
  }

  async loadLanguage(language: string): Promise<void> {
    if (!this.worker) {
      throw new Error('OCR worker not initialized');
    }

    try {
      await this.worker.loadLanguage(language);
      await this.worker.initialize(language);
      
      logger.info('OCR language loaded', { language });
    } catch (error) {
      logger.error('Failed to load OCR language', {
        error: error instanceof Error ? error.message : String(error),
        language,
      });
      throw error;
    }
  }

  async setParameters(parameters: Record<string, string>): Promise<void> {
    if (!this.worker) {
      throw new Error('OCR worker not initialized');
    }

    try {
      await this.worker.setParameters(parameters);
      logger.debug('OCR parameters set', { parameters });
    } catch (error) {
      logger.error('Failed to set OCR parameters', {
        error: error instanceof Error ? error.message : String(error),
        parameters,
      });
      throw error;
    }
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
      logger.info('OCR service terminated');
    }
  }

  // Helper method to determine if file is suitable for OCR
  static isImageFile(mimeType: string): boolean {
    const supportedTypes = [
      'image/jpeg',
      'image/png',
      'image/tiff',
      'image/bmp',
      'image/gif',
      'image/webp',
    ];
    return supportedTypes.includes(mimeType);
  }

  // Helper method to prepare image for better OCR results
  async preprocessImage(inputPath: string, outputPath: string): Promise<void> {
    try {
      // This would typically use Sharp or similar image processing library
      // For now, we'll just copy the file
      const imageBuffer = await fs.readFile(inputPath);
      await fs.writeFile(outputPath, imageBuffer);
      
      logger.debug('Image preprocessed for OCR', {
        inputPath: path.basename(inputPath),
        outputPath: path.basename(outputPath),
      });
    } catch (error) {
      logger.error('Image preprocessing failed', {
        error: error instanceof Error ? error.message : String(error),
        inputPath,
        outputPath,
      });
      throw error;
    }
  }
}

export const ocrService = new OCRService();