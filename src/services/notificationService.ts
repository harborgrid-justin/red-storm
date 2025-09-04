import { prisma } from '@/config/database';
import { logger } from '@/config/logger';
import { config } from '@/config';
import { io } from '@/app';
import nodemailer from 'nodemailer';

// Email transporter
let emailTransporter: nodemailer.Transporter | null = null;

// Initialize email transporter
const initializeEmailTransporter = () => {
  if (!config.email?.host) {
    logger.warn('SMTP configuration not found, email notifications disabled');
    return null;
  }

  try {
    emailTransporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port || 587,
      secure: config.email.secure || false,
      auth: config.email.auth ? {
        user: config.email.auth.user || '',
        pass: config.email.auth.pass || '',
      } : undefined,
    });
    logger.info('Email transporter initialized successfully');
    return emailTransporter;
  } catch (error) {
    logger.warn('Email transporter initialization failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

// Initialize on module load
initializeEmailTransporter();

export interface NotificationData {
  userId: string;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS' | 'TASK_ASSIGNED' | 'TASK_COMPLETED' | 'DEADLINE_APPROACHING' | 'WORKFLOW_COMPLETED';
  channel: ('email' | 'sms' | 'in_app')[];
  metadata?: Record<string, any>;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export class NotificationService {
  private static instance: NotificationService;

  private constructor() {}

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  // Create and send notification
  async createNotification(data: NotificationData): Promise<string> {
    try {
      // Create notification record
      const notification = await prisma.notification.create({
        data: {
          userId: data.userId,
          title: data.title,
          message: data.message,
          type: data.type,
          channel: data.channel,
          metadata: data.metadata,
          status: 'PENDING',
        },
      });

      // Send through selected channels
      const promises = data.channel.map(channel => {
        switch (channel) {
          case 'email':
            return this.sendEmailNotification(notification.id, data);
          case 'sms':
            return this.sendSMSNotification(notification.id, data);
          case 'in_app':
            return this.sendInAppNotification(notification.id, data);
          default:
            return Promise.resolve();
        }
      });

      await Promise.allSettled(promises);

      logger.info('Notification created and sent', {
        notificationId: notification.id,
        userId: data.userId,
        type: data.type,
        channels: data.channel,
      });

      return notification.id;
    } catch (error) {
      logger.error('Failed to create notification', {
        error: error instanceof Error ? error.message : String(error),
        userId: data.userId,
        type: data.type,
      });
      throw error;
    }
  }

  // Send email notification
  private async sendEmailNotification(notificationId: string, data: NotificationData): Promise<void> {
    if (!emailTransporter) {
      logger.warn('Email transporter not available, skipping email notification');
      return;
    }

    try {
      // Get user email
      const user = await prisma.user.findUnique({
        where: { id: data.userId },
        select: { email: true, firstName: true, lastName: true },
      });

      if (!user?.email) {
        logger.warn('User email not found, skipping email notification', {
          userId: data.userId,
        });
        return;
      }

      const emailHtml = this.generateEmailTemplate(data, user);

      const mailOptions = {
        from: config.email?.from || 'noreply@evidence-platform.com',
        to: user.email,
        subject: data.title,
        html: emailHtml,
      };

      await emailTransporter.sendMail(mailOptions);

      // Update notification status
      await prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
        },
      });

      logger.info('Email notification sent', {
        notificationId,
        userId: data.userId,
        email: user.email,
      });
    } catch (error) {
      logger.error('Failed to send email notification', {
        error: error instanceof Error ? error.message : String(error),
        notificationId,
        userId: data.userId,
      });

      // Update notification status to failed
      await prisma.notification.update({
        where: { id: notificationId },
        data: { status: 'FAILED' },
      });
    }
  }

  // Send SMS notification (placeholder - integrate with SMS provider)
  private async sendSMSNotification(notificationId: string, data: NotificationData): Promise<void> {
    logger.info('SMS notification placeholder', {
      notificationId,
      userId: data.userId,
      message: data.message,
    });
    
    // Update notification status
    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
      },
    });
  }

  // Send in-app notification via WebSocket
  private async sendInAppNotification(notificationId: string, data: NotificationData): Promise<void> {
    try {
      if (io) {
        io.to(`user-${data.userId}`).emit('notification', {
          id: notificationId,
          title: data.title,
          message: data.message,
          type: data.type,
          metadata: data.metadata,
          timestamp: new Date(),
        });
      }

      // Update notification status
      await prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: 'DELIVERED',
          sentAt: new Date(),
        },
      });

      logger.info('In-app notification sent', {
        notificationId,
        userId: data.userId,
      });
    } catch (error) {
      logger.error('Failed to send in-app notification', {
        error: error instanceof Error ? error.message : String(error),
        notificationId,
        userId: data.userId,
      });

      await prisma.notification.update({
        where: { id: notificationId },
        data: { status: 'FAILED' },
      });
    }
  }

  // Generate email template
  private generateEmailTemplate(data: NotificationData, user: { firstName?: string | null; lastName?: string | null }): string {
    const userName = user.firstName || user.lastName 
      ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
      : 'User';

    const getTypeIcon = (type: string) => {
      switch (type) {
        case 'SUCCESS': return '✅';
        case 'WARNING': return '⚠️';
        case 'ERROR': return '❌';
        case 'TASK_ASSIGNED': return '📋';
        case 'TASK_COMPLETED': return '✅';
        case 'DEADLINE_APPROACHING': return '⏰';
        case 'WORKFLOW_COMPLETED': return '🎉';
        default: return 'ℹ️';
      }
    };

    const getTypeColor = (type: string) => {
      switch (type) {
        case 'SUCCESS': return '#10b981';
        case 'WARNING': return '#f59e0b';
        case 'ERROR': return '#ef4444';
        case 'TASK_ASSIGNED': return '#3b82f6';
        case 'TASK_COMPLETED': return '#10b981';
        case 'DEADLINE_APPROACHING': return '#f59e0b';
        case 'WORKFLOW_COMPLETED': return '#8b5cf6';
        default: return '#6b7280';
      }
    };

    const typeIcon = getTypeIcon(data.type);
    const typeColor = getTypeColor(data.type);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${data.title}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f9fafb; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; }
          .header { background-color: ${typeColor}; color: white; padding: 20px; text-align: center; }
          .content { padding: 30px; }
          .footer { background-color: #f3f4f6; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
          .button { display: inline-block; padding: 12px 24px; background-color: ${typeColor}; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
          .metadata { background-color: #f9fafb; border-radius: 6px; padding: 15px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${typeIcon} ${data.title}</h1>
          </div>
          <div class="content">
            <p>Hello ${userName},</p>
            <p>${data.message}</p>
            ${data.metadata?.caseId ? `
              <div class="metadata">
                <strong>Case Information:</strong><br>
                Case ID: ${data.metadata.caseId}<br>
                ${data.metadata.caseNumber ? `Case Number: ${data.metadata.caseNumber}<br>` : ''}
                ${data.metadata.taskId ? `Task ID: ${data.metadata.taskId}<br>` : ''}
                ${data.metadata.dueDate ? `Due Date: ${new Date(data.metadata.dueDate).toLocaleString()}<br>` : ''}
              </div>
            ` : ''}
            ${data.metadata?.actionUrl ? `
              <a href="${data.metadata.actionUrl}" class="button">View Details</a>
            ` : ''}
          </div>
          <div class="footer">
            <p>Evidence Management Platform</p>
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Get user notifications
  async getUserNotifications(userId: string, options: {
    page?: number;
    limit?: number;
    status?: string;
    type?: string;
  } = {}): Promise<{
    notifications: any[];
    total: number;
    unreadCount: number;
  }> {
    const { page = 1, limit = 20, status, type } = options;
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (status) where.status = status;
    if (type) where.type = type;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { userId, readAt: null },
      }),
    ]);

    return { notifications, total, unreadCount };
  }

  // Mark notification as read
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date(), status: 'READ' },
    });
  }

  // Mark all notifications as read for user
  async markAllAsRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date(), status: 'READ' },
    });
  }

  // Send task assignment notification
  async sendTaskAssignedNotification(taskId: string, assignedToId: string, createdById: string): Promise<void> {
    const [task, assignedUser] = await Promise.all([
      prisma.task.findUnique({
        where: { id: taskId },
        include: {
          case: { select: { id: true, title: true, caseNumber: true } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.user.findUnique({
        where: { id: assignedToId },
        select: { firstName: true, lastName: true, email: true },
      }),
    ]);

    if (!task || !assignedUser) return;

    const createdByName = task.createdBy.firstName || task.createdBy.lastName
      ? `${task.createdBy.firstName || ''} ${task.createdBy.lastName || ''}`.trim()
      : 'System';

    await this.createNotification({
      userId: assignedToId,
      title: 'New Task Assigned',
      message: `You have been assigned a new task "${task.title}" by ${createdByName} in case "${task.case.title}".`,
      type: 'TASK_ASSIGNED',
      channel: ['email', 'in_app'],
      metadata: {
        taskId,
        caseId: task.caseId,
        caseNumber: task.case.caseNumber,
        priority: task.priority,
        dueDate: task.dueDate,
        actionUrl: `/tasks/${taskId}`,
      },
    });
  }

  // Send deadline approaching notification
  async sendDeadlineApproachingNotification(taskId: string): Promise<void> {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        case: { select: { title: true, caseNumber: true } },
        assignedTo: { select: { id: true } },
      },
    });

    if (!task?.assignedTo || !task.dueDate) return;

    await this.createNotification({
      userId: task.assignedTo.id,
      title: 'Task Deadline Approaching',
      message: `Task "${task.title}" in case "${task.case.title}" is due on ${task.dueDate.toLocaleDateString()}.`,
      type: 'DEADLINE_APPROACHING',
      channel: ['email', 'in_app'],
      metadata: {
        taskId,
        caseId: task.caseId,
        caseNumber: task.case.caseNumber,
        dueDate: task.dueDate,
        actionUrl: `/tasks/${taskId}`,
      },
    });
  }

  // Send workflow completed notification
  async sendWorkflowCompletedNotification(instanceId: string, caseId: string): Promise<void> {
    const [instance, caseData, users] = await Promise.all([
      prisma.workflowInstance.findUnique({
        where: { id: instanceId },
        include: { workflow: { select: { name: true } } },
      }),
      prisma.case.findUnique({
        where: { id: caseId },
        select: { title: true, caseNumber: true, assignedToId: true, createdById: true },
      }),
      prisma.user.findMany({
        where: {
          OR: [
            { assignedCases: { some: { id: caseId } } },
            { createdCases: { some: { id: caseId } } },
          ],
        },
        select: { id: true },
      }),
    ]);

    if (!instance || !caseData) return;

    const userIds = Array.from(new Set(users.map(u => u.id)));

    const notifications = userIds.map(userId =>
      this.createNotification({
        userId,
        title: 'Workflow Completed',
        message: `Workflow "${instance.workflow.name}" has been completed for case "${caseData.title}".`,
        type: 'WORKFLOW_COMPLETED',
        channel: ['email', 'in_app'],
        metadata: {
          instanceId,
          caseId,
          caseNumber: caseData.caseNumber,
          workflowName: instance.workflow.name,
          actionUrl: `/cases/${caseId}`,
        },
      })
    );

    await Promise.allSettled(notifications);
  }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance();