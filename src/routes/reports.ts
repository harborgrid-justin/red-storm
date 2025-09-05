import { Router } from 'express';
import { z } from 'zod';
import { verifyToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { reportGenerationService } from '../services/reportGenerationService';
import { requirePermission } from '../middleware/permissions';
import { logger } from '../config/logger';
import { AuthenticatedRequest } from '../types';

const router = Router();

// Validation schemas
const generateReportSchema = z.object({
  templateId: z.string(),
  format: z.enum(['pdf', 'html', 'json']),
  parameters: z.record(z.any()).optional(),
  caseId: z.string().optional(),
  evidenceId: z.string().optional(),
  dateRange: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  }).optional(),
});

const scheduleReportSchema = z.object({
  name: z.string(),
  templateId: z.string(),
  cronExpression: z.string(),
  recipients: z.array(z.string().email()),
  parameters: z.record(z.any()).optional(),
  isActive: z.boolean().optional().default(true),
});

// Apply authentication to all routes
router.use(verifyToken);

/**
 * GET /api/v1/reports/templates
 * Get available report templates
 */
router.get(
  '/templates',
  requirePermission('reports:read'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const templates = reportGenerationService.getTemplates();
      
      res.json({
        success: true,
        data: templates,
      });
    } catch (error) {
      logger.error('Failed to get report templates', { error, userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve report templates',
      });
    }
  }
);

/**
 * GET /api/v1/reports/templates/:id
 * Get specific report template
 */
router.get(
  '/templates/:id',
  requirePermission('reports:read'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const template = reportGenerationService.getTemplate(id);
      
      if (!template) {
        return res.status(404).json({
          success: false,
          error: 'Template not found',
        });
      }
      
      res.json({
        success: true,
        data: template,
      });
    } catch (error) {
      logger.error('Failed to get report template', { error, userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve report template',
      });
    }
  }
);

/**
 * POST /api/v1/reports/generate
 * Generate a report
 */
router.post(
  '/generate',
  requirePermission('reports:create'),
  validate({ body: generateReportSchema }),
  async (req: AuthenticatedRequest, res) => {
    try {
      const reportRequest = req.body;
      const userId = req.user!.id;
      
      const report = await reportGenerationService.generateReport(reportRequest, userId);
      
      // If it's a PDF or other file, provide download info
      if (report.filePath) {
        res.json({
          success: true,
          data: {
            id: report.id,
            name: report.name,
            format: report.format,
            generatedAt: report.generatedAt,
            downloadUrl: `/api/v1/reports/download/${report.id}`,
          },
        });
      } else {
        // Return content directly for HTML/JSON
        res.json({
          success: true,
          data: {
            id: report.id,
            name: report.name,
            format: report.format,
            generatedAt: report.generatedAt,
            content: report.content,
          },
        });
      }
    } catch (error) {
      logger.error('Failed to generate report', { 
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id 
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate report',
      });
    }
  }
);

/**
 * POST /api/v1/reports/schedule
 * Schedule automatic report generation
 */
router.post(
  '/schedule',
  requirePermission('reports:schedule'),
  validate({ body: scheduleReportSchema }),
  async (req: AuthenticatedRequest, res) => {
    try {
      const scheduleRequest = req.body;
      
      const schedule = await reportGenerationService.scheduleReport(scheduleRequest);
      
      res.status(201).json({
        success: true,
        data: schedule,
      });
    } catch (error) {
      logger.error('Failed to schedule report', { 
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id 
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to schedule report',
      });
    }
  }
);

/**
 * GET /api/v1/reports/case/:caseId/summary
 * Generate case summary report
 */
router.get(
  '/case/:caseId/summary',
  requirePermission('reports:read'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { caseId } = req.params;
      const { format = 'pdf' } = req.query as { format?: string };
      
      if (!['pdf', 'html', 'json'].includes(format)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid format. Supported formats: pdf, html, json',
        });
      }

      const report = await reportGenerationService.generateReport({
        templateId: 'case-summary',
        format: format as 'pdf' | 'html' | 'json',
        caseId,
      }, req.user!.id);
      
      if (report.filePath) {
        res.json({
          success: true,
          data: {
            id: report.id,
            name: report.name,
            format: report.format,
            generatedAt: report.generatedAt,
            downloadUrl: `/api/v1/reports/download/${report.id}`,
          },
        });
      } else {
        res.json({
          success: true,
          data: {
            id: report.id,
            name: report.name,
            format: report.format,
            generatedAt: report.generatedAt,
            content: report.content,
          },
        });
      }
    } catch (error) {
      logger.error('Failed to generate case summary report', { 
        error: error instanceof Error ? error.message : String(error),
        caseId: req.params.caseId,
        userId: req.user?.id 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to generate case summary report',
      });
    }
  }
);

/**
 * GET /api/v1/reports/case/:caseId/court-evidence
 * Generate court-ready evidence report
 */
router.get(
  '/case/:caseId/court-evidence',
  requirePermission('reports:read'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { caseId } = req.params;
      
      const report = await reportGenerationService.generateReport({
        templateId: 'court-evidence',
        format: 'pdf',
        caseId,
      }, req.user!.id);
      
      res.json({
        success: true,
        data: {
          id: report.id,
          name: report.name,
          format: report.format,
          generatedAt: report.generatedAt,
          downloadUrl: `/api/v1/reports/download/${report.id}`,
        },
      });
    } catch (error) {
      logger.error('Failed to generate court evidence report', { 
        error: error instanceof Error ? error.message : String(error),
        caseId: req.params.caseId,
        userId: req.user?.id 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to generate court evidence report',
      });
    }
  }
);

/**
 * GET /api/v1/reports/analytics/dashboard
 * Generate analytics dashboard report
 */
router.get(
  '/analytics/dashboard',
  requirePermission('reports:read'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { format = 'pdf', from, to } = req.query as { 
        format?: string; 
        from?: string; 
        to?: string; 
      };
      
      if (!['pdf', 'html', 'json'].includes(format)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid format. Supported formats: pdf, html, json',
        });
      }

      const dateRange = from && to ? {
        from: new Date(from),
        to: new Date(to),
      } : undefined;

      const report = await reportGenerationService.generateReport({
        templateId: 'analytics-dashboard',
        format: format as 'pdf' | 'html' | 'json',
        dateRange,
      }, req.user!.id);
      
      if (report.filePath) {
        res.json({
          success: true,
          data: {
            id: report.id,
            name: report.name,
            format: report.format,
            generatedAt: report.generatedAt,
            downloadUrl: `/api/v1/reports/download/${report.id}`,
          },
        });
      } else {
        res.json({
          success: true,
          data: {
            id: report.id,
            name: report.name,
            format: report.format,
            generatedAt: report.generatedAt,
            content: report.content,
          },
        });
      }
    } catch (error) {
      logger.error('Failed to generate analytics dashboard report', { 
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to generate analytics dashboard report',
      });
    }
  }
);

/**
 * GET /api/v1/reports/compliance/audit
 * Generate compliance audit report
 */
router.get(
  '/compliance/audit',
  requirePermission('reports:read'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { format = 'pdf', from, to, auditType = 'general' } = req.query as { 
        format?: string; 
        from?: string; 
        to?: string;
        auditType?: string;
      };
      
      if (!['pdf', 'html', 'json'].includes(format)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid format. Supported formats: pdf, html, json',
        });
      }

      const dateRange = from && to ? {
        from: new Date(from),
        to: new Date(to),
      } : undefined;

      const report = await reportGenerationService.generateReport({
        templateId: 'compliance-audit',
        format: format as 'pdf' | 'html' | 'json',
        dateRange,
        parameters: { auditType },
      }, req.user!.id);
      
      if (report.filePath) {
        res.json({
          success: true,
          data: {
            id: report.id,
            name: report.name,
            format: report.format,
            generatedAt: report.generatedAt,
            downloadUrl: `/api/v1/reports/download/${report.id}`,
          },
        });
      } else {
        res.json({
          success: true,
          data: {
            id: report.id,
            name: report.name,
            format: report.format,
            generatedAt: report.generatedAt,
            content: report.content,
          },
        });
      }
    } catch (error) {
      logger.error('Failed to generate compliance audit report', { 
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to generate compliance audit report',
      });
    }
  }
);

/**
 * GET /api/v1/reports/download/:reportId
 * Download a generated report file
 */
router.get(
  '/download/:reportId',
  requirePermission('reports:read'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { reportId } = req.params;
      
      // In a real implementation, you would store report metadata in the database
      // For now, we'll return an error indicating the download functionality needs database integration
      res.status(501).json({
        success: false,
        error: 'Download functionality requires database integration for report storage',
      });
    } catch (error) {
      logger.error('Failed to download report', { 
        error: error instanceof Error ? error.message : String(error),
        reportId: req.params.reportId,
        userId: req.user?.id 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to download report',
      });
    }
  }
);

export default router;