import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '@/types';
import { asyncHandler, sendSuccess, sendPaginatedSuccess, sendError } from '@/middleware/error';
import { auth } from '@/middleware/auth';
import { validateBody, validateParams, validateQuery, userSchemas, commonSchemas } from '@/middleware/validation';
import { prisma } from '@/config/database';
import { applyPagination, applySorting, buildSearchConditions, formatPaginatedResult } from '@/utils/helpers';
import { logAudit } from '@/config/logger';
import { hashPassword } from '@/utils/crypto';

const router = Router();

// All user routes require authentication
router.use(auth.required);

// Get all users (admin only)
router.get('/',
  auth.admin,
  validateQuery(commonSchemas.pagination.extend({
    search: commonSchemas.search.shape.q.optional(),
    role: commonSchemas.id.optional(),
    isActive: z.string().optional().transform(val => val === '1' || val === 'true'),
  })),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { page, limit, sortBy, sortOrder, search, role, isActive } = req.query as any;
    
    const { skip, take } = applyPagination({ page, limit });
    const orderBy = applySorting({ sortBy, sortOrder });
    
    // Build search conditions
    const searchConditions = search ? 
      buildSearchConditions(search, ['email', 'username', 'firstName', 'lastName']) : 
      undefined;
    
    // Build filter conditions
    const where: any = {
      ...searchConditions,
      ...(role && {
        roles: {
          some: {
            role: { name: role },
          },
        },
      }),
      ...(isActive !== undefined && { isActive }),
    };

    // Get users with pagination
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: orderBy || { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          isActive: true,
          lastLogin: true,
          createdAt: true,
          updatedAt: true,
          roles: {
            include: {
              role: {
                select: {
                  name: true,
                  description: true,
                },
              },
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const formattedUsers = users.map(user => ({
      ...user,
      roles: user.roles.map(userRole => userRole.role),
    }));

    const result = formatPaginatedResult(formattedUsers, page, limit, total);
    sendPaginatedSuccess(res, result.data, result.pagination);
  })
);

// Get user by ID
router.get('/:id',
  validateParams(commonSchemas.pagination.pick({ page: true }).extend({ id: commonSchemas.id })),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    
    // Check if user can access this profile
    const canAccess = req.user!.roles.includes('admin') || 
                     req.user!.roles.includes('super_admin') || 
                     req.user!.id === id;
    
    if (!canAccess) {
      return sendError(res, 'Access denied', 403, 'ACCESS_DENIED');
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        isActive: true,
        emailVerified: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
        roles: {
          include: {
            role: {
              select: {
                id: true,
                name: true,
                description: true,
                permissions: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return sendError(res, 'User not found', 404, 'USER_NOT_FOUND');
    }

    const formattedUser = {
      ...user,
      roles: user.roles.map(userRole => userRole.role),
    };

    sendSuccess(res, formattedUser);
  })
);

// Create new user (admin only)
router.post('/',
  auth.admin,
  validateBody(userSchemas.create),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { email, username, firstName, lastName, password, roles } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          ...(username ? [{ username }] : []),
        ],
      },
    });

    if (existingUser) {
      return sendError(res, 'User already exists', 409, 'USER_EXISTS');
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user with roles
    const user = await prisma.$transaction(async (tx) => {
      // Create user
      const newUser = await tx.user.create({
        data: {
          email,
          username,
          firstName,
          lastName,
          passwordHash,
        },
      });

      // Assign roles if provided
      if (roles && roles.length > 0) {
        const roleRecords = await tx.role.findMany({
          where: { name: { in: roles } },
        });

        await tx.userRole.createMany({
          data: roleRecords.map(role => ({
            userId: newUser.id,
            roleId: role.id,
          })),
        });
      }

      return newUser;
    });

    // Get user with roles
    const userWithRoles = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
        roles: {
          include: {
            role: {
              select: {
                name: true,
                description: true,
              },
            },
          },
        },
      },
    });

    // Log audit event
    logAudit('CREATE', 'USER', req.user!.id, {
      targetUserId: user.id,
      email,
      username,
      roles,
    });

    sendSuccess(res, {
      ...userWithRoles,
      roles: userWithRoles!.roles.map(userRole => userRole.role),
    }, 'User created successfully', 201);
  })
);

// Update user
router.put('/:id',
  validateParams(commonSchemas.pagination.pick({ page: true }).extend({ id: commonSchemas.id })),
  validateBody(userSchemas.update),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { email, username, firstName, lastName, isActive } = req.body;

    // Check permissions
    const canEdit = req.user!.roles.includes('admin') || 
                   req.user!.roles.includes('super_admin') || 
                   (req.user!.id === id && !('isActive' in req.body));

    if (!canEdit) {
      return sendError(res, 'Access denied', 403, 'ACCESS_DENIED');
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return sendError(res, 'User not found', 404, 'USER_NOT_FOUND');
    }

    // Check for email/username conflicts
    if (email || username) {
      const conflictUser = await prisma.user.findFirst({
        where: {
          AND: [
            { id: { not: id } },
            {
              OR: [
                ...(email ? [{ email }] : []),
                ...(username ? [{ username }] : []),
              ],
            },
          ],
        },
      });

      if (conflictUser) {
        return sendError(res, 'Email or username already in use', 409, 'USER_CONFLICT');
      }
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        ...(email && { email }),
        ...(username && { username }),
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(isActive !== undefined && { isActive }),
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        isActive: true,
        updatedAt: true,
        roles: {
          include: {
            role: {
              select: {
                name: true,
                description: true,
              },
            },
          },
        },
      },
    });

    // Log audit event
    logAudit('UPDATE', 'USER', req.user!.id, {
      targetUserId: id,
      changes: { email, username, firstName, lastName, isActive },
    });

    sendSuccess(res, {
      ...updatedUser,
      roles: updatedUser.roles.map(userRole => userRole.role),
    }, 'User updated successfully');
  })
);

// Delete user (super admin only)
router.delete('/:id',
  auth.superAdmin,
  validateParams(commonSchemas.pagination.pick({ page: true }).extend({ id: commonSchemas.id })),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    // Prevent self-deletion
    if (req.user!.id === id) {
      return sendError(res, 'Cannot delete your own account', 400, 'SELF_DELETION_NOT_ALLOWED');
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true },
    });

    if (!user) {
      return sendError(res, 'User not found', 404, 'USER_NOT_FOUND');
    }

    // Soft delete by deactivating
    await prisma.user.update({
      where: { id },
      data: { 
        isActive: false,
        // Optionally anonymize email
        email: `deleted_${Date.now()}@deleted.local`,
      },
    });

    // Also deactivate all sessions
    await prisma.userSession.updateMany({
      where: { userId: id },
      data: { isActive: false },
    });

    // Log audit event
    logAudit('DELETE', 'USER', req.user!.id, {
      targetUserId: id,
      targetEmail: user.email,
    });

    sendSuccess(res, null, 'User deleted successfully');
  })
);

// Assign roles to user (admin only)
router.post('/:id/roles',
  auth.admin,
  validateParams(commonSchemas.pagination.pick({ page: true }).extend({ id: commonSchemas.id })),
  validateBody(commonSchemas.pagination.pick({ page: true }).extend({
    roles: commonSchemas.pagination.shape.page.array().min(1),
  })),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { roles } = req.body;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!user) {
      return sendError(res, 'User not found', 404, 'USER_NOT_FOUND');
    }

    // Get role IDs
    const roleRecords = await prisma.role.findMany({
      where: { name: { in: roles } },
    });

    if (roleRecords.length !== roles.length) {
      return sendError(res, 'Some roles not found', 400, 'INVALID_ROLES');
    }

    // Remove existing roles and add new ones
    await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({
        where: { userId: id },
      });

      await tx.userRole.createMany({
        data: roleRecords.map(role => ({
          userId: id,
          roleId: role.id,
        })),
      });
    });

    // Log audit event
    logAudit('UPDATE', 'USER_ROLES', req.user!.id, {
      targetUserId: id,
      roles,
    });

    sendSuccess(res, null, 'Roles assigned successfully');
  })
);

export default router;