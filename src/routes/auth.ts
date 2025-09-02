import { Router, Response } from 'express';
import { AuthenticatedRequest } from '@/types';
import { asyncHandler, sendSuccess, sendError } from '@/middleware/error';
import { validateBody } from '@/middleware/validation';
import { userSchemas } from '@/middleware/validation';
import { authRateLimiter } from '@/middleware/security';
import { prisma } from '@/config/database';
import { cache } from '@/config/redis';
import { logger, logAudit } from '@/config/logger';
import { 
  hashPassword, 
  comparePassword, 
  generateAccessToken, 
  generateRefreshToken,
  verifyRefreshToken,
  generateSessionToken,
} from '@/utils/crypto';

const router = Router();

// Apply rate limiting to all auth routes
router.use(authRateLimiter);

// Register new user
router.post('/register', 
  validateBody(userSchemas.create),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { email, username, firstName, lastName, password } = req.body;

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

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        username,
        firstName,
        lastName,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        createdAt: true,
      },
    });

    // Log audit event
    logAudit('CREATE', 'USER', user.id, {
      email,
      username,
      ipAddress: req.ip,
    });

    logger.info('User registered successfully', {
      userId: user.id,
      email: user.email,
      correlationId: req.correlationId,
    });

    sendSuccess(res, user, 'User registered successfully', 201);
  })
);

// Login user
router.post('/login',
  validateBody(userSchemas.login),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { email, password, rememberMe } = req.body;

    // Find user with roles
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user || !user.passwordHash) {
      return sendError(res, 'Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }

    if (!user.isActive) {
      return sendError(res, 'Account is disabled', 401, 'ACCOUNT_DISABLED');
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return sendError(res, 'Account is locked', 401, 'ACCOUNT_LOCKED');
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.passwordHash);
    if (!isValidPassword) {
      // Increment failed login count
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: { increment: 1 },
          ...(user.failedLoginCount >= 4 && {
            lockedUntil: new Date(Date.now() + 30 * 60 * 1000), // Lock for 30 minutes
          }),
        },
      });

      return sendError(res, 'Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }

    // Reset failed login count and update last login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLogin: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    // Extract roles and permissions
    const roles = user.roles.map(userRole => userRole.role.name);
    const permissions = user.roles.reduce((acc: string[], userRole) => {
      const rolePermissions = userRole.role.permissions as string[];
      return [...acc, ...rolePermissions];
    }, []);

    // Generate tokens
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      roles,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);
    const sessionToken = generateSessionToken();

    // Create session record
    const expiresAt = new Date(Date.now() + (rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000));
    
    await prisma.userSession.create({
      data: {
        userId: user.id,
        sessionToken,
        refreshToken,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        expiresAt,
      },
    });

    // Store session in cache
    await cache.set(`session:${sessionToken}`, {
      userId: user.id,
      refreshToken,
    }, rememberMe ? 7 * 24 * 60 * 60 : 24 * 60 * 60);

    // Log audit event
    logAudit('LOGIN', 'AUTH', user.id, {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    logger.info('User logged in successfully', {
      userId: user.id,
      email: user.email,
      roles,
      correlationId: req.correlationId,
    });

    // Set session cookie
    (req.session as any).userId = user.id;
    (req.session as any).sessionToken = sessionToken;

    sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        roles,
        permissions: [...new Set(permissions)],
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresAt,
      },
    }, 'Login successful');
  })
);

// Refresh access token
router.post('/refresh',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return sendError(res, 'Refresh token required', 400, 'REFRESH_TOKEN_REQUIRED');
    }

    try {
      // Verify refresh token
      const payload = verifyRefreshToken(refreshToken);

      // Check if session exists and is valid
      const session = await prisma.userSession.findFirst({
        where: {
          refreshToken,
          isActive: true,
          expiresAt: { gt: new Date() },
        },
        include: {
          user: {
            include: {
              roles: {
                include: {
                  role: true,
                },
              },
            },
          },
        },
      });

      if (!session || !session.user.isActive) {
        return sendError(res, 'Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
      }

      // Extract roles
      const roles = session.user.roles.map(userRole => userRole.role.name);

      // Generate new access token
      const newAccessToken = generateAccessToken({
        userId: session.user.id,
        email: session.user.email,
        roles,
      });

      // Update session last used
      await prisma.userSession.update({
        where: { id: session.id },
        data: { lastUsedAt: new Date() },
      });

      sendSuccess(res, {
        accessToken: newAccessToken,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      }, 'Token refreshed');

    } catch (error) {
      return sendError(res, 'Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }
  })
);

// Logout user
router.post('/logout',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { refreshToken } = req.body;
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const accessToken = authHeader.substring(7);
      
      // Add access token to blacklist
      await cache.set(`blacklist:${accessToken}`, true, 15 * 60); // 15 minutes
    }

    if (refreshToken) {
      // Deactivate session
      await prisma.userSession.updateMany({
        where: { refreshToken },
        data: { isActive: false },
      });
    }

    // Clear session cookie
    req.session.destroy(() => {});

    // Log audit event
    if (req.user) {
      logAudit('LOGOUT', 'AUTH', req.user.id, {
        ipAddress: req.ip,
      });

      logger.info('User logged out', {
        userId: req.user.id,
        correlationId: req.correlationId,
      });
    }

    sendSuccess(res, null, 'Logout successful');
  })
);

// Get current user profile
router.get('/me',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return sendError(res, 'Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return sendError(res, 'User not found', 404, 'USER_NOT_FOUND');
    }

    sendSuccess(res, {
      ...user,
      roles: req.user.roles,
      permissions: req.user.permissions,
    });
  })
);

// Change password
router.put('/password',
  validateBody(userSchemas.changePassword),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return sendError(res, 'Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }

    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, passwordHash: true },
    });

    if (!user || !user.passwordHash) {
      return sendError(res, 'User not found', 404, 'USER_NOT_FOUND');
    }

    // Verify current password
    const isValidPassword = await comparePassword(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      return sendError(res, 'Current password is incorrect', 400, 'INVALID_CURRENT_PASSWORD');
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    // Invalidate all existing sessions
    await prisma.userSession.updateMany({
      where: { userId: user.id },
      data: { isActive: false },
    });

    // Log audit event
    logAudit('UPDATE', 'USER_PASSWORD', user.id, {
      ipAddress: req.ip,
    });

    logger.info('Password changed successfully', {
      userId: user.id,
      correlationId: req.correlationId,
    });

    sendSuccess(res, null, 'Password changed successfully');
  })
);

export default router;