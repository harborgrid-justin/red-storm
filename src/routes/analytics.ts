import { Router } from 'express';
import { z } from 'zod';
import { verifyToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { analyticsService } from '../services/analyticsService';
import { requirePermission } from '../middleware/permissions';
import { logger } from '../config/logger';
import { AuthenticatedRequest } from '../types';

const router = Router();

// Validation schemas
const analyticsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const timeSeriesQuerySchema = z.object({
  entity: z.enum(['case', 'evidence', 'user']),
  metric: z.enum(['count', 'resolution_time', 'activity']),
  from: z.string().datetime(),
  to: z.string().datetime(),
  granularity: z.enum(['hour', 'day', 'week', 'month']).optional().default('day'),
});

// Apply authentication to all routes
router.use(verifyToken);

/**
 * GET /api/v1/analytics/dashboard
 * Get comprehensive dashboard analytics
 */
router.get(
  '/dashboard',
  requirePermission('analytics:read'),
  validate({ query: analyticsQuerySchema }),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };
      
      const dateRange = from && to ? {
        from: new Date(from),
        to: new Date(to),
      } : undefined;

      const analytics = await analyticsService.getDashboardAnalytics(dateRange);
      
      res.json({
        success: true,
        data: analytics,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get dashboard analytics', { error, userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve analytics data',
      });
    }
  }
);

/**
 * GET /api/v1/analytics/performance
 * Get system performance metrics
 */
router.get(
  '/performance',
  requirePermission('analytics:read'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const metrics = await analyticsService.getPerformanceMetrics();
      
      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      logger.error('Failed to get performance metrics', { error, userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve performance metrics',
      });
    }
  }
);

/**
 * GET /api/v1/analytics/heatmap/evidence-access
 * Get evidence access heatmap data
 */
router.get(
  '/heatmap/evidence-access',
  requirePermission('analytics:read'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const heatmapData = await analyticsService.getEvidenceAccessHeatmap();
      
      res.json({
        success: true,
        data: heatmapData,
      });
    } catch (error) {
      logger.error('Failed to get evidence access heatmap', { error, userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve heatmap data',
      });
    }
  }
);

/**
 * GET /api/v1/analytics/trends/cases
 * Get case trends over time
 */
router.get(
  '/trends/cases',
  requirePermission('analytics:read'),
  validate({ query: analyticsQuerySchema }),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };
      
      const dateRange = from && to ? {
        from: new Date(from),
        to: new Date(to),
      } : {
        from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        to: new Date(),
      };

      const analytics = await analyticsService.getDashboardAnalytics(dateRange);
      
      res.json({
        success: true,
        data: {
          casesOverTime: analytics.trendData.casesOverTime,
          resolutionTimesTrend: analytics.trendData.resolutionTimesTrend,
        },
      });
    } catch (error) {
      logger.error('Failed to get case trends', { error, userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve trend data',
      });
    }
  }
);

/**
 * GET /api/v1/analytics/trends/evidence
 * Get evidence trends over time
 */
router.get(
  '/trends/evidence',
  requirePermission('analytics:read'),
  validate({ query: analyticsQuerySchema }),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };
      
      const dateRange = from && to ? {
        from: new Date(from),
        to: new Date(to),
      } : {
        from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        to: new Date(),
      };

      const analytics = await analyticsService.getDashboardAnalytics(dateRange);
      
      res.json({
        success: true,
        data: {
          evidenceOverTime: analytics.trendData.evidenceOverTime,
          evidenceByType: analytics.evidenceByType,
          processingStats: analytics.evidenceProcessingStats,
        },
      });
    } catch (error) {
      logger.error('Failed to get evidence trends', { error, userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve evidence trend data',
      });
    }
  }
);

/**
 * GET /api/v1/analytics/predictions
 * Get predictive analytics
 */
router.get(
  '/predictions',
  requirePermission('analytics:read'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const analytics = await analyticsService.getDashboardAnalytics();
      
      res.json({
        success: true,
        data: analytics.predictions,
      });
    } catch (error) {
      logger.error('Failed to get predictions', { error, userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve prediction data',
      });
    }
  }
);

/**
 * GET /api/v1/analytics/kpis
 * Get key performance indicators
 */
router.get(
  '/kpis',
  requirePermission('analytics:read'),
  validate({ query: analyticsQuerySchema }),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };
      
      const dateRange = from && to ? {
        from: new Date(from),
        to: new Date(to),
      } : undefined;

      const analytics = await analyticsService.getDashboardAnalytics(dateRange);
      
      // Calculate KPIs
      const kpis = {
        totalCases: analytics.totalCases,
        activeCases: analytics.activeCases,
        caseResolutionRate: analytics.totalCases > 0 ? 
          (analytics.closedCases / analytics.totalCases * 100) : 0,
        averageResolutionTime: analytics.averageCaseResolutionTime,
        totalEvidence: analytics.totalEvidence,
        evidenceProcessingRate: analytics.evidenceProcessingStats.totalProcessed > 0 ?
          (analytics.evidenceProcessingStats.totalProcessed / analytics.totalEvidence * 100) : 0,
        activeUsers: analytics.userActivityStats.activeUsers,
        systemEfficiency: analytics.averageCaseResolutionTime > 0 ? 
          Math.max(0, 100 - (analytics.averageCaseResolutionTime / 24)) : 0, // Efficiency based on resolution time
      };
      
      res.json({
        success: true,
        data: kpis,
      });
    } catch (error) {
      logger.error('Failed to get KPIs', { error, userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve KPI data',
      });
    }
  }
);

/**
 * GET /api/v1/analytics/export/:format
 * Export analytics data in various formats
 */
router.get(
  '/export/:format',
  requirePermission('analytics:export'),
  validate({ query: analyticsQuerySchema }),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { format } = req.params;
      const { from, to } = req.query as { from?: string; to?: string };
      
      if (!['json', 'csv', 'pdf'].includes(format)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid export format. Supported formats: json, csv, pdf',
        });
      }

      const dateRange = from && to ? {
        from: new Date(from),
        to: new Date(to),
      } : undefined;

      const analytics = await analyticsService.getDashboardAnalytics(dateRange);
      
      switch (format) {
        case 'json':
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', 'attachment; filename=analytics_export.json');
          res.json(analytics);
          break;
          
        case 'csv':
          // Simple CSV export of key metrics
          const csvData = [
            ['Metric', 'Value'],
            ['Total Cases', analytics.totalCases],
            ['Active Cases', analytics.activeCases],
            ['Closed Cases', analytics.closedCases],
            ['Total Evidence', analytics.totalEvidence],
            ['Average Resolution Time (hours)', analytics.averageCaseResolutionTime.toFixed(2)],
            ['Active Users', analytics.userActivityStats.activeUsers],
            ['Processing Rate (%)', ((analytics.evidenceProcessingStats.totalProcessed / Math.max(analytics.totalEvidence, 1)) * 100).toFixed(2)],
          ];
          
          const csvContent = csvData.map(row => row.join(',')).join('\n');
          
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 'attachment; filename=analytics_export.csv');
          res.send(csvContent);
          break;
          
        case 'pdf':
          // For PDF export, we'll return JSON with instructions for frontend generation
          res.json({
            success: true,
            data: analytics,
            message: 'Use this data to generate PDF on the frontend',
          });
          break;
          
        default:
          res.status(400).json({
            success: false,
            error: 'Unsupported export format',
          });
      }
    } catch (error) {
      logger.error('Failed to export analytics', { error, userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to export analytics data',
      });
    }
  }
);

export default router;