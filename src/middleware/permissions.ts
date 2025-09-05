import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, AuthorizationError } from '@/types';
import { logger } from '@/config/logger';

/**
 * Middleware to require specific permissions for route access
 */
export const requirePermission = (permission: string) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      
      if (!user) {
        throw new AuthorizationError('Authentication required');
      }

      // For now, we'll implement a simple permission check
      // In a real implementation, this would check user roles and permissions from the database
      const userPermissions = await getUserPermissions(user.id);
      
      if (!hasPermission(userPermissions, permission)) {
        logger.warn('Permission denied', {
          userId: user.id,
          requiredPermission: permission,
          userPermissions,
        });
        throw new AuthorizationError(`Permission denied: ${permission}`);
      }

      next();
    } catch (error) {
      if (error instanceof AuthorizationError) {
        res.status(403).json({
          success: false,
          error: error.message,
        });
      } else {
        logger.error('Permission check failed', {
          error: error instanceof Error ? error.message : String(error),
          permission,
          userId: req.user?.id,
        });
        res.status(500).json({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  };
};

/**
 * Get user permissions from database
 */
async function getUserPermissions(userId: string): Promise<string[]> {
  // This is a simplified implementation
  // In a real system, this would query the user's roles and permissions from the database
  try {
    const { prisma } = await import('@/config/database');
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user) {
      return [];
    }

    // Extract permissions from roles
    const permissions: string[] = [];
    user.roles.forEach(userRole => {
      const rolePermissions = userRole.role.permissions as string[] | Record<string, boolean>;
      
      if (Array.isArray(rolePermissions)) {
        permissions.push(...rolePermissions);
      } else if (typeof rolePermissions === 'object') {
        // If permissions are stored as an object with boolean values
        Object.keys(rolePermissions).forEach(permission => {
          if (rolePermissions[permission]) {
            permissions.push(permission);
          }
        });
      }
    });

    // Add default permissions for all authenticated users
    permissions.push('user:read', 'case:read', 'evidence:read');

    return [...new Set(permissions)]; // Remove duplicates
  } catch (error) {
    logger.error('Failed to get user permissions', {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
    return [];
  }
}

/**
 * Check if user has a specific permission
 */
function hasPermission(userPermissions: string[], requiredPermission: string): boolean {
  // Check for exact match
  if (userPermissions.includes(requiredPermission)) {
    return true;
  }

  // Check for wildcard permissions (e.g., "admin:*" allows "admin:read", "admin:write", etc.)
  const [resource, action] = requiredPermission.split(':');
  if (userPermissions.includes(`${resource}:*`) || userPermissions.includes('*:*')) {
    return true;
  }

  // Check for action wildcard (e.g., "*:read" allows any resource with read action)
  if (userPermissions.includes(`*:${action}`)) {
    return true;
  }

  return false;
}

/**
 * Middleware to require admin role
 */
export const requireAdmin = requirePermission('admin:*');

/**
 * Middleware to require specific role
 */
export const requireRole = (roleName: string) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      
      if (!user) {
        throw new AuthorizationError('Authentication required');
      }

      const hasRole = await checkUserRole(user.id, roleName);
      
      if (!hasRole) {
        logger.warn('Role access denied', {
          userId: user.id,
          requiredRole: roleName,
        });
        throw new AuthorizationError(`Role required: ${roleName}`);
      }

      next();
    } catch (error) {
      if (error instanceof AuthorizationError) {
        res.status(403).json({
          success: false,
          error: error.message,
        });
      } else {
        logger.error('Role check failed', {
          error: error instanceof Error ? error.message : String(error),
          roleName,
          userId: req.user?.id,
        });
        res.status(500).json({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  };
};

/**
 * Check if user has a specific role
 */
async function checkUserRole(userId: string, roleName: string): Promise<boolean> {
  try {
    const { prisma } = await import('@/config/database');
    
    const userRole = await prisma.userRole.findFirst({
      where: {
        userId,
        role: {
          name: roleName,
        },
      },
    });

    return !!userRole;
  } catch (error) {
    logger.error('Failed to check user role', {
      error: error instanceof Error ? error.message : String(error),
      userId,
      roleName,
    });
    return false;
  }
}