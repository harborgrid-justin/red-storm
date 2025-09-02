import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest, JWTPayload, AuthenticationError, AuthorizationError } from '@/types';
import { config } from '@/config';
import { cache } from '@/config/redis';
import { prisma } from '@/config/database';
import { logger } from '@/config/logger';

// JWT token verification
export const verifyToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('No token provided');
    }

    const token = authHeader.substring(7);

    // Check if token is blacklisted
    const isBlacklisted = await cache.exists(`blacklist:${token}`);
    if (isBlacklisted) {
      throw new AuthenticationError('Token has been revoked');
    }

    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload;

    if (decoded.type !== 'access') {
      throw new AuthenticationError('Invalid token type');
    }

    // Get user with roles
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new AuthenticationError('User not found or inactive');
    }

    // Extract permissions from roles
    const roles = user.roles.map(userRole => userRole.role.name);
    const permissions = user.roles.reduce((acc: string[], userRole) => {
      const rolePermissions = userRole.role.permissions as string[];
      return [...acc, ...rolePermissions];
    }, []);

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      username: user.username || undefined,
      firstName: user.firstName || undefined,
      lastName: user.lastName || undefined,
      roles,
      permissions: [...new Set(permissions)], // Remove duplicates
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AuthenticationError('Invalid token'));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new AuthenticationError('Token expired'));
    } else {
      next(error);
    }
  }
};

// Optional authentication (doesn't throw error if no token)
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // If token provided, verify it
      await verifyToken(req, res, next);
    } else {
      // No token provided, continue without authentication
      next();
    }
  } catch (error) {
    // If optional auth fails, continue without authentication
    logger.warn('Optional authentication failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId: req.correlationId,
    });
    next();
  }
};

// Role-based authorization
export const requireRole = (requiredRoles: string | string[]) => {
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
  
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }

    const hasRole = roles.some(role => req.user!.roles.includes(role));
    
    if (!hasRole) {
      throw new AuthorizationError(`Requires one of roles: ${roles.join(', ')}`);
    }

    next();
  };
};

// Permission-based authorization
export const requirePermission = (requiredPermissions: string | string[]) => {
  const permissions = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
  
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }

    const hasPermission = permissions.every(permission => 
      req.user!.permissions.includes(permission)
    );
    
    if (!hasPermission) {
      throw new AuthorizationError(`Requires permissions: ${permissions.join(', ')}`);
    }

    next();
  };
};

// Resource ownership check
export const requireOwnership = (resourceIdParam = 'id') => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const resourceId = req.params[resourceIdParam];
      
      if (!resourceId) {
        throw new AuthorizationError('Resource ID required');
      }

      // This is a generic ownership check - in practice, you'd implement
      // specific logic for different resource types
      // For now, we'll allow admins to access any resource
      if (req.user.roles.includes('admin') || req.user.roles.includes('super_admin')) {
        return next();
      }

      // For other roles, implement specific ownership logic
      // This would typically involve checking if the user created the resource
      // or has been assigned to it
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Admin only middleware
export const requireAdmin = requireRole(['admin', 'super_admin']);

// Super admin only middleware
export const requireSuperAdmin = requireRole('super_admin');

// Combine authentication and authorization
export const auth = {
  required: verifyToken,
  optional: optionalAuth,
  role: requireRole,
  permission: requirePermission,
  ownership: requireOwnership,
  admin: requireAdmin,
  superAdmin: requireSuperAdmin,
};

export default auth;