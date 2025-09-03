import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '@/types';
import { asyncHandler } from '@/middleware/error';
import { auth, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validation';
import { prisma } from '@/config/database';
import { workflowEngine, defaultCaseWorkflowDefinition } from '@/services/workflowEngine';
import { sendSuccess, sendError, sendPaginatedSuccess, formatPaginatedResult } from '@/utils/response';
import { applyPagination } from '@/utils/helpers';
import { logger } from '@/config/logger';

const router = Router();

// Validation schemas
const createWorkflowSchema = {
  body: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    definition: z.record(z.any()),
    metadata: z.record(z.any()).optional(),
  }),
};

const createInstanceSchema = {
  body: z.object({
    workflowId: z.string().cuid(),
    caseId: z.string().cuid(),
    context: z.record(z.any()).optional(),
  }),
};

const sendEventSchema = {
  body: z.object({
    event: z.string().min(1),
    payload: z.record(z.any()).optional(),
  }),
};

const createTaskSchema = {
  body: z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    type: z.enum(['MANUAL', 'AUTOMATED', 'APPROVAL', 'REVIEW', 'DEADLINE']).default('MANUAL'),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
    assignedToId: z.string().cuid().optional(),
    dueDate: z.string().datetime().optional(),
    metadata: z.record(z.any()).optional(),
  }),
};

const updateTaskSchema = {
  body: z.object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'OVERDUE']).optional(),
    assignedToId: z.string().cuid().optional(),
    dueDate: z.string().datetime().optional(),
  }),
};

const addCommentSchema = {
  body: z.object({
    content: z.string().min(1),
    metadata: z.record(z.any()).optional(),
  }),
};

// Workflow Definition routes
router.get('/definitions', 
  auth.required,
  requirePermission(['workflow:read']),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const definitions = await prisma.workflowDefinition.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    return sendSuccess(res, definitions);
  })
);

router.post('/definitions',
  auth.required,
  requirePermission(['workflow:create']),
  validate(createWorkflowSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { name, description, definition, metadata } = req.body;

    const existingDefinition = await prisma.workflowDefinition.findUnique({
      where: { name },
    });

    if (existingDefinition) {
      return sendError(res, 'Workflow definition with this name already exists', 409, 'WORKFLOW_EXISTS');
    }

    const workflowDef = await prisma.workflowDefinition.create({
      data: {
        name,
        description,
        definition,
        metadata,
      },
    });

    logger.info('Workflow definition created', {
      id: workflowDef.id,
      name,
      userId: req.user!.id,
    });

    return sendSuccess(res, workflowDef, 'Workflow definition created successfully', 201);
  })
);

// Initialize default case workflow
router.post('/definitions/default-case-workflow',
  auth.required,
  requirePermission(['workflow:create']),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const existingDefinition = await prisma.workflowDefinition.findUnique({
      where: { name: 'Default Case Workflow' },
    });

    if (existingDefinition) {
      return sendError(res, 'Default case workflow already exists', 409, 'WORKFLOW_EXISTS');
    }

    const workflowDef = await prisma.workflowDefinition.create({
      data: {
        name: 'Default Case Workflow',
        description: 'Standard workflow for case management with investigation, approval, and closure phases',
        definition: defaultCaseWorkflowDefinition,
        metadata: {
          category: 'case_management',
          isDefault: true,
        },
      },
    });

    return sendSuccess(res, workflowDef, 'Default case workflow created successfully', 201);
  })
);

// Workflow Instance routes
router.get('/instances',
  auth.required,
  requirePermission(['workflow:read']),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { page = 1, limit = 20, caseId, status } = req.query;
    const { skip, take } = applyPagination({ page: Number(page), limit: Number(limit) });

    const where: any = {};
    if (caseId) where.caseId = caseId;
    if (status) where.status = status;

    const [instances, total] = await Promise.all([
      prisma.workflowInstance.findMany({
        where,
        skip,
        take,
        include: {
          workflow: {
            select: { name: true, description: true },
          },
          case: {
            select: { id: true, title: true, caseNumber: true, status: true },
          },
          tasks: {
            where: { status: { in: ['PENDING', 'IN_PROGRESS'] } },
            select: { id: true, title: true, status: true, priority: true, dueDate: true },
          },
        },
        orderBy: { startedAt: 'desc' },
      }),
      prisma.workflowInstance.count({ where }),
    ]);

    const result = formatPaginatedResult(instances, Number(page), Number(limit), total);
    return sendPaginatedSuccess(res, result);
  })
);

router.post('/instances',
  auth.required,
  requirePermission(['workflow:create']),
  validate(createInstanceSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { workflowId, caseId, context } = req.body;

    // Check if case exists and user has access
    const caseExists = await prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true },
    });

    if (!caseExists) {
      return sendError(res, 'Case not found', 404, 'CASE_NOT_FOUND');
    }

    // Check if there's already an active workflow for this case
    const existingInstance = await prisma.workflowInstance.findFirst({
      where: { caseId, status: 'ACTIVE' },
    });

    if (existingInstance) {
      return sendError(res, 'Case already has an active workflow', 409, 'WORKFLOW_ACTIVE');
    }

    const instanceId = await workflowEngine.createWorkflowInstance(
      workflowId,
      caseId,
      { ...context, userId: req.user!.id }
    );

    const instance = await workflowEngine.getInstanceStatus(instanceId);
    
    logger.info('Workflow instance created', {
      instanceId,
      workflowId,
      caseId,
      userId: req.user!.id,
    });

    return sendSuccess(res, instance, 'Workflow instance created successfully', 201);
  })
);

router.get('/instances/:instanceId',
  auth.required,
  requirePermission(['workflow:read']),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { instanceId } = req.params;

    const instance = await workflowEngine.getInstanceStatus(instanceId);

    if (!instance) {
      return sendError(res, 'Workflow instance not found', 404, 'INSTANCE_NOT_FOUND');
    }

    return sendSuccess(res, instance);
  })
);

router.post('/instances/:instanceId/events',
  auth.required,
  requirePermission(['workflow:execute']),
  validate(sendEventSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { instanceId } = req.params;
    const { event, payload } = req.body;

    try {
      await workflowEngine.sendEvent(instanceId, event, {
        ...payload,
        userId: req.user!.id,
      });

      const updatedInstance = await workflowEngine.getInstanceStatus(instanceId);

      logger.info('Event sent to workflow', {
        instanceId,
        event,
        userId: req.user!.id,
      });

      return sendSuccess(res, updatedInstance, 'Event sent successfully');
    } catch (error) {
      logger.error('Failed to send event to workflow', {
        error: error instanceof Error ? error.message : String(error),
        instanceId,
        event,
        userId: req.user!.id,
      });
      
      return sendError(res, 'Failed to send event to workflow', 500, 'EVENT_FAILED');
    }
  })
);

router.delete('/instances/:instanceId',
  auth.required,
  requirePermission(['workflow:delete']),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { instanceId } = req.params;

    try {
      await workflowEngine.stopInstance(instanceId);

      logger.info('Workflow instance stopped', {
        instanceId,
        userId: req.user!.id,
      });

      return sendSuccess(res, { instanceId }, 'Workflow instance stopped successfully');
    } catch (error) {
      return sendError(res, 'Failed to stop workflow instance', 500, 'STOP_FAILED');
    }
  })
);

// Task Management routes
router.get('/cases/:caseId/tasks',
  auth.required,
  requirePermission(['task:read']),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { caseId } = req.params;
    const { page = 1, limit = 20, status, assignedTo } = req.query;
    const { skip, take } = applyPagination({ page: Number(page), limit: Number(limit) });

    const where: any = { caseId };
    if (status) where.status = status;
    if (assignedTo) where.assignedToId = assignedTo;

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        skip,
        take,
        include: {
          assignedTo: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          comments: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
      }),
      prisma.task.count({ where }),
    ]);

    const result = formatPaginatedResult(tasks, Number(page), Number(limit), total);
    return sendPaginatedSuccess(res, result);
  })
);

router.post('/cases/:caseId/tasks',
  auth.required,
  requirePermission(['task:create']),
  validate(createTaskSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { caseId } = req.params;
    const { title, description, type, priority, assignedToId, dueDate, metadata } = req.body;

    // Check if case exists
    const caseExists = await prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true },
    });

    if (!caseExists) {
      return sendError(res, 'Case not found', 404, 'CASE_NOT_FOUND');
    }

    const task = await prisma.task.create({
      data: {
        caseId,
        title,
        description,
        type,
        priority,
        assignedToId,
        createdById: req.user!.id,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        metadata,
      },
      include: {
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    logger.info('Task created', {
      taskId: task.id,
      caseId,
      title,
      assignedToId,
      userId: req.user!.id,
    });

    return sendSuccess(res, task, 'Task created successfully', 201);
  })
);

router.put('/tasks/:taskId',
  auth.required,
  requirePermission(['task:update']),
  validate(updateTaskSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { taskId } = req.params;
    const updates = req.body;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, assignedToId: true, createdById: true },
    });

    if (!task) {
      return sendError(res, 'Task not found', 404, 'TASK_NOT_FOUND');
    }

    // Check if user can update this task
    const canUpdate = req.user!.roles.includes('admin') ||
                     req.user!.roles.includes('super_admin') ||
                     task.assignedToId === req.user!.id ||
                     task.createdById === req.user!.id;

    if (!canUpdate) {
      return sendError(res, 'Access denied', 403, 'ACCESS_DENIED');
    }

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        ...updates,
        ...(updates.dueDate ? { dueDate: new Date(updates.dueDate) } : {}),
        ...(updates.status === 'COMPLETED' ? { completedAt: new Date() } : {}),
      },
      include: {
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    logger.info('Task updated', {
      taskId,
      updates,
      userId: req.user!.id,
    });

    return sendSuccess(res, updatedTask, 'Task updated successfully');
  })
);

router.post('/tasks/:taskId/comments',
  auth.required,
  requirePermission(['task:comment']),
  validate(addCommentSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { taskId } = req.params;
    const { content, metadata } = req.body;

    const taskExists = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true },
    });

    if (!taskExists) {
      return sendError(res, 'Task not found', 404, 'TASK_NOT_FOUND');
    }

    const comment = await prisma.taskComment.create({
      data: {
        taskId,
        userId: req.user!.id,
        content,
        metadata,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    logger.info('Task comment added', {
      taskId,
      commentId: comment.id,
      userId: req.user!.id,
    });

    return sendSuccess(res, comment, 'Comment added successfully', 201);
  })
);

export default router;