import { Router, Response } from 'express';
import { AuthenticatedRequest } from '@/types';
import { asyncHandler, sendSuccess, sendPaginatedSuccess, sendError } from '@/middleware/error';
import { auth } from '@/middleware/auth';
import { validateBody, validateParams, validateQuery, caseSchemas, commonSchemas } from '@/middleware/validation';
import { prisma } from '@/config/database';
import { applyPagination, applySorting, buildSearchConditions, buildFilterConditions, formatPaginatedResult, generateCaseNumber } from '@/utils/helpers';
import { logAudit } from '@/config/logger';

const router = Router();

// All case routes require authentication
router.use(auth.required);

// Get all cases with filtering and pagination
router.get('/',
  validateQuery(commonSchemas.pagination.extend({
    search: commonSchemas.search.shape.q.optional(),
    status: caseSchemas.filter.shape.status.optional(),
    priority: caseSchemas.filter.shape.priority.optional(),
    assignedToId: caseSchemas.filter.shape.assignedToId.optional(),
    createdById: caseSchemas.filter.shape.createdById.optional(),
  })),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { page, limit, sortBy, sortOrder, search, status, priority, assignedToId, createdById } = req.query as any;
    
    const { skip, take } = applyPagination({ page, limit });
    const orderBy = applySorting({ sortBy, sortOrder });
    
    // Build search conditions
    const searchConditions = search ? 
      buildSearchConditions(search, ['title', 'description', 'caseNumber']) : 
      undefined;
    
    // Build filter conditions
    const filterConditions = buildFilterConditions({
      status: status ? (Array.isArray(status) ? status : [status]) : undefined,
      priority: priority ? (Array.isArray(priority) ? priority : [priority]) : undefined,
      assignedToId,
      createdById,
    });

    const where: any = {
      ...searchConditions,
      ...filterConditions,
    };

    // Get cases with pagination
    const [cases, total] = await Promise.all([
      prisma.case.findMany({
        where,
        skip,
        take,
        orderBy: orderBy || { createdAt: 'desc' },
        include: {
          assignedTo: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          tags: {
            include: {
              tag: true,
            },
          },
          _count: {
            select: {
              evidenceItems: true,
            },
          },
        },
      }),
      prisma.case.count({ where }),
    ]);

    const formattedCases = cases.map(caseItem => ({
      ...caseItem,
      tags: caseItem.tags.map(caseTag => caseTag.tag),
      evidenceCount: caseItem._count.evidenceItems,
      _count: undefined,
    }));

    const result = formatPaginatedResult(formattedCases, page, limit, total);
    sendPaginatedSuccess(res, result.data, result.pagination);
  })
);

// Get case by ID
router.get('/:id',
  validateParams(commonSchemas.pagination.pick({ page: true }).extend({ id: commonSchemas.id })),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const caseItem = await prisma.case.findUnique({
      where: { id },
      include: {
        assignedTo: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        tags: {
          include: {
            tag: true,
          },
        },
        evidenceItems: {
          select: {
            id: true,
            itemNumber: true,
            title: true,
            type: true,
            status: true,
            createdAt: true,
          },
          orderBy: {
            itemNumber: 'asc',
          },
        },
      },
    });

    if (!caseItem) {
      return sendError(res, 'Case not found', 404, 'CASE_NOT_FOUND');
    }

    const formattedCase = {
      ...caseItem,
      tags: caseItem.tags.map(caseTag => caseTag.tag),
    };

    sendSuccess(res, formattedCase);
  })
);

// Create new case
router.post('/',
  auth.permission(['case:create']),
  validateBody(caseSchemas.create),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { title, description, priority, assignedToId, tags } = req.body;

    // Generate unique case number
    const caseNumber = generateCaseNumber();

    // Create case with tags
    const caseItem = await prisma.$transaction(async (tx) => {
      // Create case
      const newCase = await tx.case.create({
        data: {
          caseNumber,
          title,
          description,
          priority,
          assignedToId,
          createdById: req.user!.id,
        },
      });

      // Create tags if provided
      if (tags && tags.length > 0) {
        // Find or create tags
        const tagRecords = await Promise.all(
          tags.map(async (tagName: string) => {
            return await tx.tag.upsert({
              where: { name: tagName },
              update: {},
              create: { name: tagName },
            });
          })
        );

        // Create case-tag relationships
        await tx.caseTag.createMany({
          data: tagRecords.map(tag => ({
            caseId: newCase.id,
            tagId: tag.id,
          })),
        });
      }

      return newCase;
    });

    // Get case with relations
    const caseWithRelations = await prisma.case.findUnique({
      where: { id: caseItem.id },
      include: {
        assignedTo: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    // Log audit event
    logAudit('CREATE', 'CASE', req.user!.id, {
      caseId: caseItem.id,
      caseNumber,
      title,
      priority,
      assignedToId,
    });

    sendSuccess(res, {
      ...caseWithRelations,
      tags: caseWithRelations!.tags.map(caseTag => caseTag.tag),
    }, 'Case created successfully', 201);
  })
);

// Update case
router.put('/:id',
  validateParams(commonSchemas.pagination.pick({ page: true }).extend({ id: commonSchemas.id })),
  validateBody(caseSchemas.update),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { title, description, priority, status, assignedToId, tags } = req.body;

    // Check if case exists
    const existingCase = await prisma.case.findUnique({
      where: { id },
      select: { id: true, createdById: true, status: true },
    });

    if (!existingCase) {
      return sendError(res, 'Case not found', 404, 'CASE_NOT_FOUND');
    }

    // Check permissions (can edit if admin, case creator, or assigned to)
    const canEdit = req.user!.roles.includes('admin') || 
                   req.user!.roles.includes('super_admin') || 
                   existingCase.createdById === req.user!.id ||
                   req.user!.permissions.includes('case:edit');

    if (!canEdit) {
      return sendError(res, 'Access denied', 403, 'ACCESS_DENIED');
    }

    // Update case with tags
    const updatedCase = await prisma.$transaction(async (tx) => {
      // Update case
      const updated = await tx.case.update({
        where: { id },
        data: {
          ...(title && { title }),
          ...(description !== undefined && { description }),
          ...(priority && { priority }),
          ...(status && { status }),
          ...(assignedToId !== undefined && { assignedToId }),
        },
      });

      // Update tags if provided
      if (tags !== undefined) {
        // Remove existing tags
        await tx.caseTag.deleteMany({
          where: { caseId: id },
        });

        // Add new tags
        if (tags.length > 0) {
          const tagRecords = await Promise.all(
            tags.map(async (tagName: string) => {
              return await tx.tag.upsert({
                where: { name: tagName },
                update: {},
                create: { name: tagName },
              });
            })
          );

          await tx.caseTag.createMany({
            data: tagRecords.map(tag => ({
              caseId: id,
              tagId: tag.id,
            })),
          });
        }
      }

      return updated;
    });

    // Get case with relations
    const caseWithRelations = await prisma.case.findUnique({
      where: { id },
      include: {
        assignedTo: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    // Log audit event
    logAudit('UPDATE', 'CASE', req.user!.id, {
      caseId: id,
      changes: { title, description, priority, status, assignedToId, tags },
    });

    sendSuccess(res, {
      ...caseWithRelations,
      tags: caseWithRelations!.tags.map(caseTag => caseTag.tag),
    }, 'Case updated successfully');
  })
);

// Delete case (soft delete)
router.delete('/:id',
  auth.permission(['case:delete']),
  validateParams(commonSchemas.pagination.pick({ page: true }).extend({ id: commonSchemas.id })),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    // Check if case exists
    const existingCase = await prisma.case.findUnique({
      where: { id },
      select: { id: true, createdById: true, title: true },
    });

    if (!existingCase) {
      return sendError(res, 'Case not found', 404, 'CASE_NOT_FOUND');
    }

    // Check permissions
    const canDelete = req.user!.roles.includes('admin') || 
                     req.user!.roles.includes('super_admin') || 
                     existingCase.createdById === req.user!.id;

    if (!canDelete) {
      return sendError(res, 'Access denied', 403, 'ACCESS_DENIED');
    }

    // Soft delete by setting status to ARCHIVED
    await prisma.case.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });

    // Log audit event
    logAudit('DELETE', 'CASE', req.user!.id, {
      caseId: id,
      title: existingCase.title,
    });

    sendSuccess(res, null, 'Case archived successfully');
  })
);

// Get case statistics
router.get('/stats/overview',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const [
      totalCases,
      activeCases,
      closedCases,
      assignedToUser,
      createdByUser,
      recentCases,
    ] = await Promise.all([
      prisma.case.count(),
      prisma.case.count({ where: { status: 'ACTIVE' } }),
      prisma.case.count({ where: { status: 'CLOSED' } }),
      prisma.case.count({ where: { assignedToId: req.user!.id } }),
      prisma.case.count({ where: { createdById: req.user!.id } }),
      prisma.case.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          caseNumber: true,
          title: true,
          status: true,
          priority: true,
          createdAt: true,
        },
      }),
    ]);

    const stats = {
      totalCases,
      activeCases,
      closedCases,
      archivedCases: totalCases - activeCases - closedCases,
      assignedToUser,
      createdByUser,
      recentCases,
    };

    sendSuccess(res, stats);
  })
);

export default router;