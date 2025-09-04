import { logger } from '@/config/logger';
import { prisma } from '@/config/database';
import * as natural from 'natural';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export interface SimilarityResult {
  id: string;
  score: number;
  type: 'text' | 'image' | 'audio';
  metadata: Record<string, any>;
}

export interface ImageHash {
  dhash: string;
  averageHash: string;
  phash?: string; // Optional, requires native library
}

export interface TextSimilarityOptions {
  algorithm?: 'tfidf' | 'jaccard' | 'dice' | 'levenshtein';
  threshold?: number;
  maxResults?: number;
}

export interface ImageSimilarityOptions {
  threshold?: number;
  maxResults?: number;
  hashType?: 'dhash' | 'average' | 'phash';
}

export class SimilaritySearchService {
  private tfidf: natural.TfIdf;

  constructor() {
    this.tfidf = new natural.TfIdf();
  }

  // Text Similarity Methods
  async findSimilarText(
    text: string,
    options: TextSimilarityOptions = {}
  ): Promise<SimilarityResult[]> {
    const {
      algorithm = 'tfidf',
      threshold = 0.1,
      maxResults = 10,
    } = options;

    try {
      switch (algorithm) {
        case 'tfidf':
          return await this.findSimilarTextTfIdf(text, threshold, maxResults);
        case 'jaccard':
          return await this.findSimilarTextJaccard(text, threshold, maxResults);
        case 'dice':
          return await this.findSimilarTextDice(text, threshold, maxResults);
        case 'levenshtein':
          return await this.findSimilarTextLevenshtein(text, threshold, maxResults);
        default:
          throw new Error(`Unknown similarity algorithm: ${algorithm}`);
      }
    } catch (error) {
      logger.error('Text similarity search failed', {
        error: error instanceof Error ? error.message : String(error),
        algorithm,
        textLength: text.length,
      });
      throw error;
    }
  }

  private async findSimilarTextTfIdf(
    text: string,
    threshold: number,
    maxResults: number
  ): Promise<SimilarityResult[]> {
    // Get all evidence items with text content
    const evidenceItems = await prisma.evidenceItem.findMany({
      where: {
        OR: [
          { metadata: { path: ['fileProcessing', 'extractedText'], not: null } },
          { metadata: { path: ['ocr', 'text'], not: null } },
          { metadata: { path: ['transcription'], not: null } },
        ],
      },
    });

    // Prepare corpus
    const documents: Array<{ id: string; text: string; metadata: any }> = [];
    
    // Add the query text
    documents.push({ id: 'query', text, metadata: {} });

    // Add evidence texts
    for (const item of evidenceItems) {
      const metadata = item.metadata as any;
      const combinedText = [
        metadata?.fileProcessing?.extractedText,
        metadata?.ocr?.text,
        metadata?.transcription,
      ]
        .filter(Boolean)
        .join(' ');

      if (combinedText.trim()) {
        documents.push({
          id: item.id,
          text: combinedText,
          metadata: {
            evidenceId: item.id,
            title: item.title,
            type: item.type,
            caseId: item.caseId,
          },
        });
      }
    }

    // Build TF-IDF index
    this.tfidf = new natural.TfIdf();
    documents.forEach(doc => {
      this.tfidf.addDocument(doc.text);
    });

    // Calculate similarities
    const similarities: SimilarityResult[] = [];
    
    this.tfidf.tfidfs(text, (i, measure) => {
      if (i === 0) return; // Skip the query document itself
      
      if (measure >= threshold) {
        const doc = documents[i];
        similarities.push({
          id: doc.id,
          score: measure,
          type: 'text',
          metadata: doc.metadata,
        });
      }
    });

    // Sort by score and limit results
    return similarities
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  private async findSimilarTextJaccard(
    text: string,
    threshold: number,
    maxResults: number
  ): Promise<SimilarityResult[]> {
    const evidenceItems = await prisma.evidenceItem.findMany({
      where: {
        OR: [
          { metadata: { path: ['fileProcessing', 'extractedText'], not: null } },
          { metadata: { path: ['ocr', 'text'], not: null } },
          { metadata: { path: ['transcription'], not: null } },
        ],
      },
    });

    const queryTokens = new Set(natural.WordTokenizer.prototype.tokenize(text.toLowerCase()));
    const similarities: SimilarityResult[] = [];

    for (const item of evidenceItems) {
      const metadata = item.metadata as any;
      const combinedText = [
        metadata?.fileProcessing?.extractedText,
        metadata?.ocr?.text,
        metadata?.transcription,
      ]
        .filter(Boolean)
        .join(' ');

      if (combinedText.trim()) {
        const docTokens = new Set(natural.WordTokenizer.prototype.tokenize(combinedText.toLowerCase()));
        const jaccard = natural.JaccardDistance(queryTokens, docTokens, true);
        const similarity = 1 - jaccard;

        if (similarity >= threshold) {
          similarities.push({
            id: item.id,
            score: similarity,
            type: 'text',
            metadata: {
              evidenceId: item.id,
              title: item.title,
              type: item.type,
              caseId: item.caseId,
            },
          });
        }
      }
    }

    return similarities
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  private async findSimilarTextDice(
    text: string,
    threshold: number,
    maxResults: number
  ): Promise<SimilarityResult[]> {
    const evidenceItems = await prisma.evidenceItem.findMany({
      include: {
        files: {
          where: {
            OR: [
              { extractedText: { not: null } },
              { ocrText: { not: null } },
              { transcription: { not: null } },
            ],
          },
        },
      },
    });

    const queryTokens = new Set(natural.WordTokenizer.prototype.tokenize(text.toLowerCase()));
    const similarities: SimilarityResult[] = [];

    for (const item of evidenceItems) {
      for (const file of item.files) {
        const combinedText = [
          file.extractedText,
          file.ocrText,
          file.transcription,
        ]
          .filter(Boolean)
          .join(' ');

        if (combinedText.trim()) {
          const docTokens = new Set(natural.WordTokenizer.prototype.tokenize(combinedText.toLowerCase()));
          const dice = natural.DiceCoefficient(queryTokens, docTokens);

          if (dice >= threshold) {
            similarities.push({
              id: file.id,
              score: dice,
              type: 'text',
              metadata: {
                evidenceId: item.id,
                fileName: file.fileName,
                mimeType: file.mimeType,
                caseId: item.caseId,
              },
            });
          }
        }
      }
    }

    return similarities
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  private async findSimilarTextLevenshtein(
    text: string,
    threshold: number,
    maxResults: number
  ): Promise<SimilarityResult[]> {
    const evidenceItems = await prisma.evidenceItem.findMany({
      include: {
        files: {
          where: {
            OR: [
              { extractedText: { not: null } },
              { ocrText: { not: null } },
              { transcription: { not: null } },
            ],
          },
        },
      },
    });

    const similarities: SimilarityResult[] = [];

    for (const item of evidenceItems) {
      for (const file of item.files) {
        const combinedText = [
          file.extractedText,
          file.ocrText,
          file.transcription,
        ]
          .filter(Boolean)
          .join(' ');

        if (combinedText.trim()) {
          const distance = natural.LevenshteinDistance(text.toLowerCase(), combinedText.toLowerCase());
          const maxLength = Math.max(text.length, combinedText.length);
          const similarity = 1 - (distance / maxLength);

          if (similarity >= threshold) {
            similarities.push({
              id: file.id,
              score: similarity,
              type: 'text',
              metadata: {
                evidenceId: item.id,
                fileName: file.fileName,
                mimeType: file.mimeType,
                caseId: item.caseId,
              },
            });
          }
        }
      }
    }

    return similarities
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  // Image Similarity Methods
  async findSimilarImages(
    imagePath: string,
    options: ImageSimilarityOptions = {}
  ): Promise<SimilarityResult[]> {
    const {
      threshold = 0.8,
      maxResults = 10,
      hashType = 'dhash',
    } = options;

    try {
      const queryHash = await this.generateImageHashes(imagePath);
      const imageFiles = await prisma.evidenceFile.findMany({
        where: {
          mimeType: {
            startsWith: 'image/',
          },
          imageHashes: {
            not: null,
          },
        },
        include: {
          evidence: true,
        },
      });

      const similarities: SimilarityResult[] = [];

      for (const file of imageFiles) {
        if (!file.imageHashes) continue;

        const storedHashes = JSON.parse(file.imageHashes as string) as ImageHash;
        let similarity = 0;

        switch (hashType) {
          case 'dhash':
            similarity = this.calculateHashSimilarity(queryHash.dhash, storedHashes.dhash);
            break;
          case 'average':
            similarity = this.calculateHashSimilarity(queryHash.averageHash, storedHashes.averageHash);
            break;
          case 'phash':
            if (queryHash.phash && storedHashes.phash) {
              similarity = this.calculateHashSimilarity(queryHash.phash, storedHashes.phash);
            }
            break;
        }

        if (similarity >= threshold) {
          similarities.push({
            id: file.id,
            score: similarity,
            type: 'image',
            metadata: {
              evidenceId: file.evidenceId,
              fileName: file.fileName,
              mimeType: file.mimeType,
              caseId: file.evidence?.caseId,
            },
          });
        }
      }

      return similarities
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);
    } catch (error) {
      logger.error('Image similarity search failed', {
        error: error instanceof Error ? error.message : String(error),
        imagePath,
      });
      throw error;
    }
  }

  async generateImageHashes(imagePath: string): Promise<ImageHash> {
    try {
      // For now, we'll use a simple approach without native dependencies
      // In a production environment, you would use libraries like blockhash or phash
      
      const imageBuffer = await fs.readFile(imagePath);
      const dhash = this.simpleDHash(imageBuffer);
      const averageHash = this.simpleAverageHash(imageBuffer);

      return {
        dhash,
        averageHash,
      };
    } catch (error) {
      logger.error('Image hash generation failed', {
        error: error instanceof Error ? error.message : String(error),
        imagePath,
      });
      throw error;
    }
  }

  private simpleDHash(imageBuffer: Buffer): string {
    // Simplified dHash implementation
    // In production, use a proper image processing library
    return createHash('md5').update(imageBuffer).digest('hex').substring(0, 16);
  }

  private simpleAverageHash(imageBuffer: Buffer): string {
    // Simplified average hash implementation
    // In production, use a proper image processing library
    return createHash('sha1').update(imageBuffer).digest('hex').substring(0, 16);
  }

  private calculateHashSimilarity(hash1: string, hash2: string): number {
    if (hash1.length !== hash2.length) {
      return 0;
    }

    let matches = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] === hash2[i]) {
        matches++;
      }
    }

    return matches / hash1.length;
  }

  // Audio Similarity Methods
  async findSimilarAudio(
    audioPath: string,
    threshold: number = 0.8,
    maxResults: number = 10
  ): Promise<SimilarityResult[]> {
    try {
      // Audio fingerprinting would require specialized libraries
      // For now, we'll use a placeholder implementation
      const audioFingerprint = await this.generateAudioFingerprint(audioPath);
      
      const audioFiles = await prisma.evidenceFile.findMany({
        where: {
          mimeType: {
            startsWith: 'audio/',
          },
          audioFingerprint: {
            not: null,
          },
        },
        include: {
          evidence: true,
        },
      });

      const similarities: SimilarityResult[] = [];

      for (const file of audioFiles) {
        if (!file.audioFingerprint) continue;

        const similarity = this.compareAudioFingerprints(
          audioFingerprint,
          file.audioFingerprint
        );

        if (similarity >= threshold) {
          similarities.push({
            id: file.id,
            score: similarity,
            type: 'audio',
            metadata: {
              evidenceId: file.evidenceId,
              fileName: file.fileName,
              mimeType: file.mimeType,
              caseId: file.evidence?.caseId,
            },
          });
        }
      }

      return similarities
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);
    } catch (error) {
      logger.error('Audio similarity search failed', {
        error: error instanceof Error ? error.message : String(error),
        audioPath,
      });
      throw error;
    }
  }

  private async generateAudioFingerprint(audioPath: string): Promise<string> {
    // Placeholder implementation
    // In production, use libraries like chromaprint or similar
    const audioBuffer = await fs.readFile(audioPath);
    return createHash('sha256').update(audioBuffer).digest('hex').substring(0, 32);
  }

  private compareAudioFingerprints(fingerprint1: string, fingerprint2: string): number {
    // Simplified comparison
    // In production, use proper audio fingerprint comparison algorithms
    return this.calculateHashSimilarity(fingerprint1, fingerprint2);
  }

  // Cross-case evidence correlation
  async findCrossCorrelations(
    evidenceId: string,
    threshold: number = 0.5
  ): Promise<Array<{
    relatedEvidenceId: string;
    caseId: string;
    correlationType: 'text' | 'image' | 'audio' | 'metadata';
    score: number;
    details: Record<string, any>;
  }>> {
    try {
      const evidence = await prisma.evidenceItem.findUnique({
        where: { id: evidenceId },
        include: {
          files: true,
          case: true,
        },
      });

      if (!evidence) {
        throw new Error('Evidence not found');
      }

      const correlations: Array<{
        relatedEvidenceId: string;
        caseId: string;
        correlationType: 'text' | 'image' | 'audio' | 'metadata';
        score: number;
        details: Record<string, any>;
      }> = [];

      // Find correlations across different cases
      for (const file of evidence.files) {
        if (file.extractedText || file.ocrText || file.transcription) {
          const textContent = [file.extractedText, file.ocrText, file.transcription]
            .filter(Boolean)
            .join(' ');

          const textSimilarities = await this.findSimilarText(textContent, {
            threshold,
            maxResults: 20,
          });

          for (const similarity of textSimilarities) {
            const relatedFile = await prisma.evidenceFile.findUnique({
              where: { id: similarity.id },
              include: { evidence: true },
            });

            if (relatedFile && relatedFile.evidence?.caseId !== evidence.caseId) {
              correlations.push({
                relatedEvidenceId: relatedFile.evidenceId,
                caseId: relatedFile.evidence.caseId,
                correlationType: 'text',
                score: similarity.score,
                details: {
                  sourceFile: file.fileName,
                  relatedFile: relatedFile.fileName,
                  textLength: textContent.length,
                },
              });
            }
          }
        }

        if (file.mimeType?.startsWith('image/') && file.filePath) {
          try {
            const imageSimilarities = await this.findSimilarImages(file.filePath, {
              threshold,
              maxResults: 20,
            });

            for (const similarity of imageSimilarities) {
              const relatedFile = await prisma.evidenceFile.findUnique({
                where: { id: similarity.id },
                include: { evidence: true },
              });

              if (relatedFile && relatedFile.evidence?.caseId !== evidence.caseId) {
                correlations.push({
                  relatedEvidenceId: relatedFile.evidenceId,
                  caseId: relatedFile.evidence.caseId,
                  correlationType: 'image',
                  score: similarity.score,
                  details: {
                    sourceFile: file.fileName,
                    relatedFile: relatedFile.fileName,
                  },
                });
              }
            }
          } catch (error) {
            logger.debug('Could not process image for correlation', {
              error: error instanceof Error ? error.message : String(error),
              fileName: file.fileName,
            });
          }
        }
      }

      // Remove duplicates and sort by score
      const uniqueCorrelations = correlations.reduce((acc, current) => {
        const key = `${current.relatedEvidenceId}-${current.correlationType}`;
        const existing = acc.find(c => `${c.relatedEvidenceId}-${c.correlationType}` === key);
        
        if (!existing || current.score > existing.score) {
          return acc.filter(c => `${c.relatedEvidenceId}-${c.correlationType}` !== key).concat(current);
        }
        
        return acc;
      }, [] as typeof correlations);

      return uniqueCorrelations.sort((a, b) => b.score - a.score);
    } catch (error) {
      logger.error('Cross-case correlation analysis failed', {
        error: error instanceof Error ? error.message : String(error),
        evidenceId,
      });
      throw error;
    }
  }
}

export const similaritySearchService = new SimilaritySearchService();