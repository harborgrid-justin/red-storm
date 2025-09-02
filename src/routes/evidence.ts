import { Router, Response } from 'express';
import { AuthenticatedRequest } from '@/types';
import { asyncHandler, sendSuccess, sendPaginatedSuccess, sendError } from '@/middleware/error';
import { auth } from '@/middleware/auth';
import { validateBody, validateParams, validateQuery, evidenceSchemas, commonSchemas } from '@/middleware/validation';
import { prisma } from '@/config/database';
import { applyPagination, applySorting, buildSearchConditions, buildFilterConditions, formatPaginatedResult, generateEvidenceNumber } from '@/utils/helpers';
import { logAudit } from '@/config/logger';

const router = Router();

// All evidence routes require authentication
router.use(auth.required);

// Get all evidence items with filtering and pagination
router.get('/',
  validateQuery(commonSchemas.pagination.extend({
    search: commonSchemas.search.shape.q.optional(),
    caseId: evidenceSchemas.filter.shape.caseId.optional(),
    type: evidenceSchemas.filter.shape.type.optional(),
    status: evidenceSchemas.filter.shape.status.optional(),
    collectedById: evidenceSchemas.filter.shape.collectedById.optional(),
  })),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { page, limit, sortBy, sortOrder, search, caseId, type, status, collectedById } = req.query as any;
    
    const { skip, take } = applyPagination({ page, limit });
    const orderBy = applySorting({ sortBy, sortOrder });
    
    // Build search conditions
    const searchConditions = search ? 
      buildSearchConditions(search, ['title', 'description', 'itemNumber']) : 
      undefined;
    
    // Build filter conditions
    const filterConditions = buildFilterConditions({
      caseId,
      type: type ? (Array.isArray(type) ? type : [type]) : undefined,
      status: status ? (Array.isArray(status) ? status : [status]) : undefined,
      collectedById,
    });

    const where: any = {
      isDeleted: false,
      ...searchConditions,
      ...filterConditions,
    };

    // Get evidence with pagination
    const [evidence, total] = await Promise.all([
      prisma.evidenceItem.findMany({
        where,
        skip,
        take,
        orderBy: orderBy || { createdAt: 'desc' },
        include: {
          case: {
            select: {
              id: true,
              caseNumber: true,
              title: true,
              status: true,
            },
          },
          collectedBy: {
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
      }),
      prisma.evidenceItem.count({ where }),
    ]);

    const formattedEvidence = evidence.map(item => ({
      ...item,
      tags: item.tags.map(evidenceTag => evidenceTag.tag),
    }));

    const result = formatPaginatedResult(formattedEvidence, page, limit, total);
    sendPaginatedSuccess(res, result.data, result.pagination);
  })
);

// Get evidence by ID
router.get('/:id',
  validateParams(commonSchemas.pagination.pick({ page: true }).extend({ id: commonSchemas.id })),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const evidence = await prisma.evidenceItem.findUnique({
      where: { id, isDeleted: false },
      include: {
        case: {
          select: {
            id: true,
            caseNumber: true,
            title: true,
            status: true,
          },
        },
        collectedBy: {
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

    if (!evidence) {
      return sendError(res, 'Evidence not found', 404, 'EVIDENCE_NOT_FOUND');
    }

    const formattedEvidence = {
      ...evidence,
      tags: evidence.tags.map(evidenceTag => evidenceTag.tag),
    };

    sendSuccess(res, formattedEvidence);
  })
);

// Create new evidence item
router.post('/',
  auth.permission(['evidence:create']),
  validateBody(evidenceSchemas.create),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { caseId, title, description, type, location, metadata, tags } = req.body;

    // Check if case exists and user has access
    const caseItem = await prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true, caseNumber: true },
    });

    if (!caseItem) {
      return sendError(res, 'Case not found', 404, 'CASE_NOT_FOUND');
    }

    // Get next evidence number for this case
    const lastEvidence = await prisma.evidenceItem.findFirst({
      where: { caseId },
      orderBy: { itemNumber: 'desc' },
      select: { itemNumber: true },
    });

    // Extract sequence number from last evidence item
    let nextSequence = 1;
    if (lastEvidence?.itemNumber) {
      const match = lastEvidence.itemNumber.match(/-E(\d+)$/);
      if (match) {
        nextSequence = parseInt(match[1], 10) + 1;
      }
    }

    const itemNumber = generateEvidenceNumber(caseItem.caseNumber, nextSequence);

    // Create evidence with tags
    const evidence = await prisma.$transaction(async (tx) => {
      // Create evidence item
      const newEvidence = await tx.evidenceItem.create({
        data: {
          caseId,
          itemNumber,
          title,
          description,
          type,
          location,
          metadata: metadata || {},
          collectedById: req.user!.id,
          collectedAt: new Date(),
          chainOfCustody: [{
            action: 'COLLECTED',
            userId: req.user!.id,
            timestamp: new Date().toISOString(),
            location: location || 'Unknown',
            notes: `Evidence collected by ${req.user!.email}`,
          }],
        },
      });

      // Create tags if provided
      if (tags && tags.length > 0) {
        const tagRecords = await Promise.all(
          tags.map(async (tagName: string) => {
            return await tx.tag.upsert({
              where: { name: tagName },
              update: {},
              create: { name: tagName },
            });
          })
        );

        await tx.evidenceTag.createMany({
          data: tagRecords.map(tag => ({
            evidenceId: newEvidence.id,
            tagId: tag.id,
          })),
        });
      }

      return newEvidence;
    });

    // Get evidence with relations
    const evidenceWithRelations = await prisma.evidenceItem.findUnique({
      where: { id: evidence.id },
      include: {
        case: {
          select: {
            id: true,
            caseNumber: true,
            title: true,
            status: true,
          },
        },
        collectedBy: {
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
    logAudit('CREATE', 'EVIDENCE', req.user!.id, {
      evidenceId: evidence.id,
      itemNumber,
      caseId,
      title,
      type,
    });

    sendSuccess(res, {
      ...evidenceWithRelations,
      tags: evidenceWithRelations!.tags.map(evidenceTag => evidenceTag.tag),
    }, 'Evidence item created successfully', 201);
  })
);

// Update evidence item
router.put('/:id',
  validateParams(commonSchemas.pagination.pick({ page: true }).extend({ id: commonSchemas.id })),
  validateBody(evidenceSchemas.update),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { title, description, type, status, location, metadata, tags } = req.body;

    // Check if evidence exists
    const existingEvidence = await prisma.evidenceItem.findUnique({
      where: { id, isDeleted: false },
      select: { 
        id: true, 
        collectedById: true, 
        status: true, 
        chainOfCustody: true,
        case: { select: { id: true } },
      },
    });

    if (!existingEvidence) {
      return sendError(res, 'Evidence not found', 404, 'EVIDENCE_NOT_FOUND');
    }

    // Check permissions
    const canEdit = req.user!.roles.includes('admin') || 
                   req.user!.roles.includes('super_admin') || 
                   existingEvidence.collectedById === req.user!.id ||
                   req.user!.permissions.includes('evidence:edit');

    if (!canEdit) {
      return sendError(res, 'Access denied', 403, 'ACCESS_DENIED');
    }

    // Update chain of custody if status is changing
    let updatedChainOfCustody = existingEvidence.chainOfCustody as any[];
    if (status && status !== existingEvidence.status) {
      updatedChainOfCustody = [
        ...updatedChainOfCustody,
        {
          action: 'STATUS_CHANGED',
          userId: req.user!.id,
          timestamp: new Date().toISOString(),
          oldStatus: existingEvidence.status,
          newStatus: status,
          notes: `Status changed by ${req.user!.email}`,
        },
      ];
    }

    // Update evidence with tags
    const updatedEvidence = await prisma.$transaction(async (tx) => {
      // Update evidence item
      const updated = await tx.evidenceItem.update({
        where: { id },
        data: {
          ...(title && { title }),
          ...(description !== undefined && { description }),
          ...(type && { type }),
          ...(status && { status, chainOfCustody: updatedChainOfCustody }),
          ...(location !== undefined && { location }),
          ...(metadata !== undefined && { metadata }),
        },
      });

      // Update tags if provided
      if (tags !== undefined) {
        // Remove existing tags
        await tx.evidenceTag.deleteMany({
          where: { evidenceId: id },
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

          await tx.evidenceTag.createMany({
            data: tagRecords.map(tag => ({
              evidenceId: id,
              tagId: tag.id,
            })),
          });
        }
      }

      return updated;
    });

    // Get evidence with relations
    const evidenceWithRelations = await prisma.evidenceItem.findUnique({
      where: { id },
      include: {
        case: {
          select: {
            id: true,
            caseNumber: true,
            title: true,
            status: true,
          },
        },
        collectedBy: {
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
    logAudit('UPDATE', 'EVIDENCE', req.user!.id, {
      evidenceId: id,
      changes: { title, description, type, status, location, metadata, tags },
    });

    sendSuccess(res, {
      ...evidenceWithRelations,
      tags: evidenceWithRelations!.tags.map(evidenceTag => evidenceTag.tag),
    }, 'Evidence item updated successfully');
  })
);

// Delete evidence item (soft delete)
router.delete('/:id',
  auth.permission(['evidence:delete']),
  validateParams(commonSchemas.pagination.pick({ page: true }).extend({ id: commonSchemas.id })),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    // Check if evidence exists
    const existingEvidence = await prisma.evidenceItem.findUnique({
      where: { id, isDeleted: false },
      select: { id: true, collectedById: true, title: true, itemNumber: true },
    });

    if (!existingEvidence) {
      return sendError(res, 'Evidence not found', 404, 'EVIDENCE_NOT_FOUND');
    }

    // Check permissions
    const canDelete = req.user!.roles.includes('admin') || 
                     req.user!.roles.includes('super_admin') || 
                     existingEvidence.collectedById === req.user!.id;

    if (!canDelete) {
      return sendError(res, 'Access denied', 403, 'ACCESS_DENIED');
    }

    // Soft delete
    await prisma.evidenceItem.update({
      where: { id },
      data: { isDeleted: true },
    });

    // Log audit event
    logAudit('DELETE', 'EVIDENCE', req.user!.id, {
      evidenceId: id,
      itemNumber: existingEvidence.itemNumber,
      title: existingEvidence.title,
    });

    sendSuccess(res, null, 'Evidence item deleted successfully');
  })
);

// Get evidence by case ID
router.get('/case/:caseId',
  validateParams(commonSchemas.pagination.pick({ page: true }).extend({ caseId: commonSchemas.id })),
  validateQuery(commonSchemas.pagination),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { caseId } = req.params;
    const { page, limit, sortBy, sortOrder } = req.query as any;
    
    // Check if case exists
    const caseItem = await prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true },
    });

    if (!caseItem) {
      return sendError(res, 'Case not found', 404, 'CASE_NOT_FOUND');
    }

    const { skip, take } = applyPagination({ page, limit });
    const orderBy = applySorting({ sortBy, sortOrder });

    const [evidence, total] = await Promise.all([
      prisma.evidenceItem.findMany({
        where: { caseId, isDeleted: false },
        skip,
        take,
        orderBy: orderBy || { itemNumber: 'asc' },
        include: {
          collectedBy: {
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
      }),
      prisma.evidenceItem.count({ where: { caseId, isDeleted: false } }),
    ]);

    const formattedEvidence = evidence.map(item => ({
      ...item,
      tags: item.tags.map(evidenceTag => evidenceTag.tag),
    }));

    const result = formatPaginatedResult(formattedEvidence, page, limit, total);
    sendPaginatedSuccess(res, result.data, result.pagination);
  })
);

// Get evidence statistics
router.get('/stats/overview',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const [
      totalEvidence,
      collectedEvidence,
      processingEvidence,
      analyzedEvidence,
      storedEvidence,
      collectedByUser,
    ] = await Promise.all([
      prisma.evidenceItem.count({ where: { isDeleted: false } }),
      prisma.evidenceItem.count({ where: { status: 'COLLECTED', isDeleted: false } }),
      prisma.evidenceItem.count({ where: { status: 'PROCESSING', isDeleted: false } }),
      prisma.evidenceItem.count({ where: { status: 'ANALYZED', isDeleted: false } }),
      prisma.evidenceItem.count({ where: { status: 'STORED', isDeleted: false } }),
      prisma.evidenceItem.count({ where: { collectedById: req.user!.id, isDeleted: false } }),
    ]);

    const stats = {
      totalEvidence,
      collectedEvidence,
      processingEvidence,
      analyzedEvidence,
      storedEvidence,
      disposedEvidence: totalEvidence - collectedEvidence - processingEvidence - analyzedEvidence - storedEvidence,
      collectedByUser,
    };

    sendSuccess(res, stats);
  })
);

export default router;