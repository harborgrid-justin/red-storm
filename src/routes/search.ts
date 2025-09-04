import { Router } from 'express';
import { body, query, param } from 'express-validator';
import { auth } from '@/middleware/auth';
import { validate } from '@/middleware/validation';
import { asyncHandler } from '@/middleware/error';
import { elasticsearchService, SearchQuery } from '@/services/searchService';
import { searchExportService, ExportOptions } from '@/services/searchExportService';
import { similaritySearchService } from '@/services/similaritySearchService';
import { FileProcessingWorker } from '@/services/backgroundJobs';
import { logger } from '@/config/logger';
import { prisma } from '@/config/database';

const router = Router();

// Universal search endpoint
router.get('/search',
  auth.required,
  [
    query('q').optional().isString().trim(),
    query('type').optional().isIn(['case', 'evidence', 'document']),
    query('status').optional().isString(),
    query('priority').optional().isString(),
    query('caseId').optional().isUUID(),
    query('evidenceType').optional().isString(),
    query('dateFrom').optional().isISO8601(),
    query('dateTo').optional().isISO8601(),
    query('tags').optional().isString(),
    query('assignedTo').optional().isUUID(),
    query('from').optional().isInt({ min: 0 }),
    query('size').optional().isInt({ min: 1, max: 100 }),
    query('highlight').optional().isBoolean(),
    query('suggest').optional().isBoolean(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const {
      q: query,
      type,
      status,
      priority,
      caseId,
      evidenceType,
      dateFrom,
      dateTo,
      tags,
      assignedTo,
      from = 0,
      size = 20,
      highlight = true,
      suggest = false,
    } = req.query;

    const searchQuery: SearchQuery = {
      query: (query as string) || '',
      filters: {
        ...(type && { type: type as any }),
        ...(status && { status: status as string }),
        ...(priority && { priority: priority as string }),
        ...(caseId && { caseId: caseId as string }),
        ...(evidenceType && { evidenceType: evidenceType as string }),
        ...(assignedTo && { assignedTo: assignedTo as string }),
        ...(tags && { tags: (tags as string).split(',') }),
        ...(dateFrom || dateTo) && {
          dateRange: {
            ...(dateFrom && { from: dateFrom as string }),
            ...(dateTo && { to: dateTo as string }),
          },
        },
      },
      from: parseInt(from as string),
      size: parseInt(size as string),
      highlight: String(highlight) === 'true',
      suggest: String(suggest) === 'true',
    };

    try {
      const results = await elasticsearchService.search(searchQuery);
      
      res.json({
        success: true,
        data: results,
        query: searchQuery,
      });
    } catch (error) {
      logger.error('Search failed', {
        error: error instanceof Error ? error.message : String(error),
        query: searchQuery,
        userId: req.user?.id,
      });
      
      res.status(500).json({
        success: false,
        error: 'Search failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

// Get search suggestions
router.get('/suggestions',
  auth.required,
  [
    query('q').isString().isLength({ min: 1, max: 100 }),
    query('size').optional().isInt({ min: 1, max: 20 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { q: text, size = 10 } = req.query;

    try {
      const suggestions = await elasticsearchService.getSuggestions(
        text as string,
        parseInt(size as string)
      );
      
      res.json({
        success: true,
        data: suggestions,
      });
    } catch (error) {
      logger.error('Suggestions failed', {
        error: error instanceof Error ? error.message : String(error),
        text,
        userId: req.user?.id,
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to get suggestions',
      });
    }
  })
);

// Export search results
router.post('/export',
  auth.required,
  [
    body('format').isIn(['csv', 'excel', 'pdf']),
    body('filename').optional().isString().isLength({ max: 100 }),
    body('includeMetadata').optional().isBoolean(),
    body('includeHighlights').optional().isBoolean(),
    body('customFields').optional().isArray(),
    body('searchQuery').isObject(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const {
      format,
      filename,
      includeMetadata = false,
      includeHighlights = false,
      customFields = [],
      searchQuery,
    } = req.body;

    try {
      // Perform the search first
      const searchResults = await elasticsearchService.search(searchQuery);
      
      // Export the results
      const exportOptions: ExportOptions = {
        format,
        filename,
        includeMetadata,
        includeHighlights,
        customFields,
      };
      
      const exportResult = await searchExportService.exportSearchResults(
        searchResults.results,
        exportOptions
      );
      
      res.json({
        success: true,
        data: {
          downloadUrl: `/api/v1/search/download/${exportResult.filename}`,
          filename: exportResult.filename,
          size: exportResult.size,
          recordCount: exportResult.recordCount,
        },
      });
    } catch (error) {
      logger.error('Export failed', {
        error: error instanceof Error ? error.message : String(error),
        format,
        userId: req.user?.id,
      });
      
      res.status(500).json({
        success: false,
        error: 'Export failed',
      });
    }
  })
);

// Download exported file
router.get('/download/:filename',
  auth.required,
  [
    param('filename').isString(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { filename } = req.params;
    
    try {
      const fileInfo = await searchExportService.getExportInfo(filename);
      
      if (!fileInfo.exists) {
        return res.status(404).json({
          success: false,
          error: 'File not found',
        });
      }
      
      res.download(`./exports/${filename}`, filename, (err) => {
        if (err) {
          logger.error('Download failed', {
            error: err.message,
            filename,
            userId: req.user?.id,
          });
          res.status(500).json({
            success: false,
            error: 'Download failed',
          });
        }
      });
    } catch (error) {
      logger.error('Download failed', {
        error: error instanceof Error ? error.message : String(error),
        filename,
        userId: req.user?.id,
      });
      
      res.status(500).json({
        success: false,
        error: 'Download failed',
      });
    }
  })
);

// Text similarity search
router.post('/similarity/text',
  auth.required,
  [
    body('text').isString().isLength({ min: 10, max: 5000 }),
    body('algorithm').optional().isIn(['tfidf', 'jaccard', 'dice', 'levenshtein']),
    body('threshold').optional().isFloat({ min: 0, max: 1 }),
    body('maxResults').optional().isInt({ min: 1, max: 50 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const {
      text,
      algorithm = 'tfidf',
      threshold = 0.1,
      maxResults = 10,
    } = req.body;

    try {
      const results = await similaritySearchService.findSimilarText(text, {
        algorithm,
        threshold,
        maxResults,
      });
      
      res.json({
        success: true,
        data: results,
      });
    } catch (error) {
      logger.error('Text similarity search failed', {
        error: error instanceof Error ? error.message : String(error),
        algorithm,
        userId: req.user?.id,
      });
      
      res.status(500).json({
        success: false,
        error: 'Text similarity search failed',
      });
    }
  })
);

// Image similarity search
router.post('/similarity/image',
  auth.required,
  [
    body('evidenceId').isUUID(),
    body('threshold').optional().isFloat({ min: 0, max: 1 }),
    body('maxResults').optional().isInt({ min: 1, max: 50 }),
    body('hashType').optional().isIn(['dhash', 'average', 'phash']),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const {
      evidenceId,
      threshold = 0.8,
      maxResults = 10,
      hashType = 'dhash',
    } = req.body;

    try {
      // Get the evidence item and file path
      const evidence = await prisma.evidenceItem.findUnique({
        where: { id: evidenceId },
      });
      
      if (!evidence || !evidence.filePath) {
        return res.status(404).json({
          success: false,
          error: 'Evidence or file not found',
        });
      }
      
      const results = await similaritySearchService.findSimilarImages(evidence.filePath, {
        threshold,
        maxResults,
        hashType,
      });
      
      res.json({
        success: true,
        data: results,
      });
    } catch (error) {
      logger.error('Image similarity search failed', {
        error: error instanceof Error ? error.message : String(error),
        evidenceId,
        userId: req.user?.id,
      });
      
      res.status(500).json({
        success: false,
        error: 'Image similarity search failed',
      });
    }
  })
);

// Cross-case correlation analysis
router.post('/correlation/:evidenceId',
  auth.required,
  auth.role(['admin', 'investigator']),
  [
    param('evidenceId').isUUID(),
    body('threshold').optional().isFloat({ min: 0, max: 1 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { evidenceId } = req.params;
    const { threshold = 0.5 } = req.body;

    try {
      const correlations = await similaritySearchService.findCrossCorrelations(
        evidenceId,
        threshold
      );
      
      res.json({
        success: true,
        data: correlations,
      });
    } catch (error) {
      logger.error('Cross-case correlation failed', {
        error: error instanceof Error ? error.message : String(error),
        evidenceId,
        userId: req.user?.id,
      });
      
      res.status(500).json({
        success: false,
        error: 'Cross-case correlation failed',
      });
    }
  })
);

// Queue OCR processing
router.post('/ocr/:evidenceId',
  auth.required,
  auth.role(['admin', 'investigator']),
  [
    param('evidenceId').isUUID(),
    body('language').optional().isString().isLength({ min: 2, max: 5 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { evidenceId } = req.params;
    const { language = 'eng' } = req.body;

    try {
      // Get the evidence item
      const evidence = await prisma.evidenceItem.findUnique({
        where: { id: evidenceId },
      });
      
      if (!evidence || !evidence.filePath) {
        return res.status(404).json({
          success: false,
          error: 'Evidence or file not found',
        });
      }
      
      const metadata = evidence.metadata as any;
      const mimetype = metadata?.fileProcessing?.mimetype;
      
      if (!mimetype || !mimetype.startsWith('image/')) {
        return res.status(400).json({
          success: false,
          error: 'Evidence is not an image file',
        });
      }
      
      // Queue OCR job
      const job = await FileProcessingWorker.addOCRJob({
        evidenceFileId: evidenceId,
        filePath: evidence.filePath,
        mimetype,
        language,
      });
      
      res.json({
        success: true,
        data: {
          jobId: job.id,
          message: 'OCR processing queued',
        },
      });
    } catch (error) {
      logger.error('OCR queue failed', {
        error: error instanceof Error ? error.message : String(error),
        evidenceId,
        userId: req.user?.id,
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to queue OCR processing',
      });
    }
  })
);

// Reindex all documents
router.post('/reindex',
  auth.required,
  auth.role(['admin']),
  asyncHandler(async (req, res) => {
    try {
      // Initialize Elasticsearch indices first
      await elasticsearchService.initializeIndices();
      
      // Queue reindexing job
      await elasticsearchService.reindexAll();
      
      res.json({
        success: true,
        message: 'Reindexing started',
      });
    } catch (error) {
      logger.error('Reindexing failed', {
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id,
      });
      
      res.status(500).json({
        success: false,
        error: 'Reindexing failed',
      });
    }
  })
);

export default router;