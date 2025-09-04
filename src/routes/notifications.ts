import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '@/types';
import { asyncHandler } from '@/middleware/error';
import { auth, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validation';
import { prisma } from '@/config/database';
import { notificationService } from '@/services/notificationService';
import { sendSuccess, sendError, sendPaginatedSuccess, formatPaginatedResult } from '@/utils/response';
import { applyPagination } from '@/utils/helpers';
import { logger } from '@/config/logger';

const router = Router();

// Validation schemas
const createNotificationSchema = {
  body: z.object({
    userId: z.string().cuid(),
    title: z.string().min(1),
    message: z.string().min(1),
    type: z.enum(['INFO', 'WARNING', 'ERROR', 'SUCCESS', 'TASK_ASSIGNED', 'TASK_COMPLETED', 'DEADLINE_APPROACHING', 'WORKFLOW_COMPLETED']).default('INFO'),
    channel: z.array(z.enum(['email', 'sms', 'in_app'])).default(['in_app']),
    metadata: z.record(z.any()).optional(),
  }),
};

// Get user notifications
router.get('/',
  auth.required,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { page = 1, limit = 20, status, type } = req.query;
    const userId = req.user!.id;

    const result = await notificationService.getUserNotifications(userId, {
      page: Number(page),
      limit: Number(limit),
      status: status as string,
      type: type as string,
    });

    const paginatedResult = formatPaginatedResult(
      result.notifications,
      Number(page),
      Number(limit),
      result.total
    );

    return res.json({
      success: true,
      data: paginatedResult,
      meta: {
        unreadCount: result.unreadCount,
      },
    });
  })
);

// Get notification statistics
router.get('/stats',
  auth.required,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;

    const [total, unread, byType, recent] = await Promise.all([
      prisma.notification.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, readAt: null } }),
      prisma.notification.groupBy({
        by: ['type'],
        where: { userId },
        _count: { id: true },
      }),
      prisma.notification.findMany({
        where: { userId },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          type: true,
          createdAt: true,
          readAt: true,
        },
      }),
    ]);

    const typeStats = byType.reduce((acc, item) => {
      acc[item.type] = item._count.id;
      return acc;
    }, {} as Record<string, number>);

    return sendSuccess(res, {
      total,
      unread,
      byType: typeStats,
      recent,
    });
  })
);

// Mark notification as read
router.patch('/:notificationId/read',
  auth.required,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { notificationId } = req.params;
    const userId = req.user!.id;

    try {
      await notificationService.markAsRead(notificationId, userId);
      return sendSuccess(res, { notificationId }, 'Notification marked as read');
    } catch (error) {
      return sendError(res, 'Failed to mark notification as read', 500, 'MARK_READ_FAILED');
    }
  })
);

// Mark all notifications as read
router.patch('/read-all',
  auth.required,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;

    try {
      await notificationService.markAllAsRead(userId);
      return sendSuccess(res, { userId }, 'All notifications marked as read');
    } catch (error) {
      return sendError(res, 'Failed to mark all notifications as read', 500, 'MARK_ALL_READ_FAILED');
    }
  })
);

// Create notification (admin only)
router.post('/',
  auth.required,
  requirePermission(['notification:create']),
  validate(createNotificationSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { userId, title, message, type, channel, metadata } = req.body;

    try {
      const notificationId = await notificationService.createNotification({
        userId,
        title,
        message,
        type,
        channel,
        metadata,
      });

      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
      });

      logger.info('Notification created via API', {
        notificationId,
        userId,
        type,
        createdBy: req.user!.id,
      });

      return sendSuccess(res, notification, 'Notification created successfully', 201);
    } catch (error) {
      logger.error('Failed to create notification via API', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        type,
        createdBy: req.user!.id,
      });
      
      return sendError(res, 'Failed to create notification', 500, 'CREATE_NOTIFICATION_FAILED');
    }
  })
);

// Delete notification
router.delete('/:notificationId',
  auth.required,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { notificationId } = req.params;
    const userId = req.user!.id;

    try {
      const deletedCount = await prisma.notification.deleteMany({
        where: { id: notificationId, userId },
      });

      if (deletedCount.count === 0) {
        return sendError(res, 'Notification not found', 404, 'NOTIFICATION_NOT_FOUND');
      }

      return sendSuccess(res, { notificationId }, 'Notification deleted successfully');
    } catch (error) {
      return sendError(res, 'Failed to delete notification', 500, 'DELETE_NOTIFICATION_FAILED');
    }
  })
);

// Bulk actions
router.post('/bulk-action',
  auth.required,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { action, notificationIds } = req.body;
    const userId = req.user!.id;

    if (!['mark_read', 'delete'].includes(action)) {
      return sendError(res, 'Invalid action', 400, 'INVALID_ACTION');
    }

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return sendError(res, 'No notification IDs provided', 400, 'MISSING_NOTIFICATION_IDS');
    }

    try {
      let result;
      
      if (action === 'mark_read') {
        result = await prisma.notification.updateMany({
          where: {
            id: { in: notificationIds },
            userId,
            readAt: null,
          },
          data: {
            readAt: new Date(),
            status: 'READ',
          },
        });
      } else if (action === 'delete') {
        result = await prisma.notification.deleteMany({
          where: {
            id: { in: notificationIds },
            userId,
          },
        });
      }

      return sendSuccess(res, { 
        action, 
        affectedCount: result?.count || 0 
      }, `Bulk ${action} completed successfully`);
    } catch (error) {
      return sendError(res, `Failed to perform bulk ${action}`, 500, 'BULK_ACTION_FAILED');
    }
  })
);

// Get notification preferences (placeholder for future implementation)
router.get('/preferences',
  auth.required,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // This would fetch user's notification preferences from the database
    // For now, return default preferences
    const defaultPreferences = {
      email: {
        enabled: true,
        taskAssigned: true,
        deadlineApproaching: true,
        workflowCompleted: true,
        caseUpdated: false,
      },
      inApp: {
        enabled: true,
        taskAssigned: true,
        deadlineApproaching: true,
        workflowCompleted: true,
        caseUpdated: true,
      },
      sms: {
        enabled: false,
        taskAssigned: false,
        deadlineApproaching: true,
        workflowCompleted: false,
        caseUpdated: false,
      },
    };

    return sendSuccess(res, defaultPreferences);
  })
);

// Update notification preferences (placeholder for future implementation)
router.put('/preferences',
  auth.required,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const preferences = req.body;
    
    // This would update user's notification preferences in the database
    // For now, just return the preferences as if they were saved
    
    logger.info('Notification preferences updated', {
      userId: req.user!.id,
      preferences,
    });

    return sendSuccess(res, preferences, 'Notification preferences updated successfully');
  })
);

export default router;