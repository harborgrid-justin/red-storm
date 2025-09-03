import express from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import RedisStore from 'connect-redis';
import { Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from '@/config';
import { logger, correlationIdMiddleware, requestLoggingMiddleware } from '@/config/logger';
import { redis } from '@/config/redis';
import { connectDatabase, disconnectDatabase } from '@/config/database';
import { connectRedis, disconnectRedis } from '@/config/redis';

// Middleware imports
import { errorHandler, notFoundHandler } from '@/middleware/error';
import { 
  securityHeaders, 
  corsMiddleware, 
  compressionMiddleware, 
  rateLimiter,
  healthCheckBypass,
  apiVersioning,
} from '@/middleware/security';

// Route imports
import authRoutes from '@/routes/auth';
import userRoutes from '@/routes/users';
import caseRoutes from '@/routes/cases';
import evidenceRoutes from '@/routes/evidence';
import evidenceFileRoutes from '@/routes/evidenceFiles';
import workflowRoutes from '@/routes/workflows';
import healthRoutes from '@/routes/health';
import graphqlRoutes from '@/routes/graphql';

// Service imports
import { fileProcessingWorker } from '@/services/backgroundJobs';
import { scheduledJobManager } from '@/services/scheduledJobs';
import { chainOfCustodyService } from '@/services/chainOfCustody';

export class Application {
  private app: express.Application;
  private server: Server | null = null;
  private io: SocketIOServer | null = null;

  constructor() {
    this.app = express();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    // Health check bypass (must be first)
    this.app.use(healthCheckBypass);

    // Security middleware
    this.app.use(securityHeaders);
    this.app.use(corsMiddleware);
    this.app.use(compressionMiddleware);

    // Request parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use(cookieParser());

    // Session configuration
    this.app.use(session({
      store: new RedisStore({ client: redis }),
      secret: config.session.secret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        secure: config.isProduction,
        httpOnly: true,
        maxAge: config.session.maxAge,
        sameSite: config.isProduction ? 'strict' : 'lax',
      },
      name: 'evidenceSessionId',
    }));

    // Logging and correlation
    this.app.use(correlationIdMiddleware);
    this.app.use(requestLoggingMiddleware);

    // API versioning
    this.app.use(apiVersioning);

    // Rate limiting (after health check bypass)
    this.app.use(rateLimiter);

    // Trust proxy for production
    if (config.isProduction) {
      this.app.set('trust proxy', 1);
    }
  }

  private initializeRoutes(): void {
    // Health checks (no rate limiting)
    this.app.use('/health', healthRoutes);

    // API routes with versioning
    const apiRouter = express.Router();
    
    // Authentication routes
    apiRouter.use('/auth', authRoutes);
    
    // Resource routes
    apiRouter.use('/users', userRoutes);
    apiRouter.use('/cases', caseRoutes);
    apiRouter.use('/evidence', evidenceRoutes);
    apiRouter.use('/evidence-files', evidenceFileRoutes);
    apiRouter.use('/workflows', workflowRoutes);
    
    // GraphQL endpoint
    apiRouter.use('/graphql', graphqlRoutes);
    
    // Mount API router
    this.app.use(`/api/${config.apiVersion}`, apiRouter);

    // API documentation
    this.app.get('/api', (req, res) => {
      res.json({
        name: 'Evidence Management Platform API',
        version: config.apiVersion,
        environment: config.env,
        documentation: `/api/${config.apiVersion}/docs`,
        health: '/health',
        endpoints: {
          auth: `/api/${config.apiVersion}/auth`,
          users: `/api/${config.apiVersion}/users`,
          cases: `/api/${config.apiVersion}/cases`,
          evidence: `/api/${config.apiVersion}/evidence`,
          evidenceFiles: `/api/${config.apiVersion}/evidence-files`,
          graphql: `/api/${config.apiVersion}/graphql`,
        },
      });
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        message: 'Evidence Management Platform API',
        version: config.apiVersion,
        environment: config.env,
        api: '/api',
        health: '/health',
      });
    });
  }

  private initializeErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);
  }

  private initializeWebSocket(): void {
    if (!this.server) {
      throw new Error('HTTP server not initialized');
    }

    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: config.websocket.corsOrigin,
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    // Socket.IO connection handling
    this.io.on('connection', (socket) => {
      logger.info('WebSocket client connected', {
        socketId: socket.id,
        clientAddress: socket.handshake.address,
      });

      // Authentication for socket connections
      socket.on('authenticate', async (token: string) => {
        try {
          // Verify JWT token
          // Implementation would go here
          socket.join('authenticated');
          socket.emit('authenticated', { success: true });
        } catch (error) {
          socket.emit('authentication_error', { message: 'Invalid token' });
          socket.disconnect();
        }
      });

      // Handle case updates
      socket.on('subscribe_case', (caseId: string) => {
        socket.join(`case:${caseId}`);
        logger.debug('Client subscribed to case updates', {
          socketId: socket.id,
          caseId,
        });
      });

      socket.on('unsubscribe_case', (caseId: string) => {
        socket.leave(`case:${caseId}`);
      });

      // Handle evidence updates
      socket.on('subscribe_evidence', (evidenceId: string) => {
        socket.join(`evidence:${evidenceId}`);
      });

      socket.on('unsubscribe_evidence', (evidenceId: string) => {
        socket.leave(`evidence:${evidenceId}`);
      });

      // Disconnect handling
      socket.on('disconnect', (reason) => {
        logger.info('WebSocket client disconnected', {
          socketId: socket.id,
          reason,
        });
      });

      // Error handling
      socket.on('error', (error) => {
        logger.error('WebSocket error', {
          socketId: socket.id,
          error: error.message,
        });
      });
    });
  }

  public async initialize(): Promise<void> {
    try {
      // Connect to external services
      await connectDatabase();
      await connectRedis();

      // Initialize background services
      await this.initializeBackgroundServices();

      logger.info('Application initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize application', { error });
      throw error;
    }
  }

  private async initializeBackgroundServices(): Promise<void> {
    try {
      // Initialize file processing worker
      logger.info('Initializing background processing worker');

      // Initialize scheduled job manager
      logger.info('Initializing scheduled job manager');
      
      // Initialize chain of custody service
      logger.info('Initializing chain of custody service');

      // Create uploads directory if it doesn't exist
      const fs = await import('fs/promises');
      const uploadsPath = process.env.UPLOAD_PATH || './uploads';
      await fs.mkdir(uploadsPath, { recursive: true });
      await fs.mkdir(`${uploadsPath}/temp`, { recursive: true });

      logger.info('Background services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize background services', { error });
      throw error;
    }
  }

  public async start(port?: number): Promise<void> {
    const serverPort = port || config.port;

    try {
      this.server = this.app.listen(serverPort, () => {
        logger.info(`Server started on port ${serverPort}`, {
          environment: config.env,
          version: config.apiVersion,
          port: serverPort,
        });
      });

      // Initialize WebSocket after HTTP server starts
      this.initializeWebSocket();

      // Set global WebSocket server reference
      const { setWebSocketServer } = await import('./app');
      if (this.io) {
        setWebSocketServer(this.io);
      }

      // Graceful shutdown handling
      process.on('SIGTERM', this.gracefulShutdown.bind(this));
      process.on('SIGINT', this.gracefulShutdown.bind(this));
      process.on('uncaughtException', this.handleUncaughtException.bind(this));
      process.on('unhandledRejection', this.handleUnhandledRejection.bind(this));

    } catch (error) {
      logger.error('Failed to start server', { error });
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          logger.info('HTTP server stopped');
          resolve();
        });
      });
    }
  }

  private async gracefulShutdown(signal: string): Promise<void> {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    try {
      // Close WebSocket server
      if (this.io) {
        this.io.close();
        logger.info('WebSocket server closed');
      }

      // Close HTTP server
      await this.stop();

      // Stop background services
      await this.stopBackgroundServices();

      // Disconnect from external services
      await disconnectDatabase();
      await disconnectRedis();

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown', { error });
      process.exit(1);
    }
  }

  private async stopBackgroundServices(): Promise<void> {
    try {
      // Cancel scheduled jobs
      scheduledJobManager.cancelAllJobs();
      
      // Close file processing queues
      const { fileProcessingQueue } = await import('@/config/redis');
      await fileProcessingQueue.close();
      
      logger.info('Background services stopped');
    } catch (error) {
      logger.error('Error stopping background services', { error });
    }
  }

  private handleUncaughtException(error: Error): void {
    logger.error('Uncaught Exception', {
      message: error.message,
      stack: error.stack,
    });
    
    // Perform graceful shutdown
    this.gracefulShutdown('UNCAUGHT_EXCEPTION');
  }

  private handleUnhandledRejection(reason: any): void {
    logger.error('Unhandled Rejection', { reason });
    
    // Perform graceful shutdown
    this.gracefulShutdown('UNHANDLED_REJECTION');
  }

  // Method to broadcast events via WebSocket
  public broadcastToCase(caseId: string, event: string, data: any): void {
    if (this.io) {
      this.io.to(`case:${caseId}`).emit(event, data);
    }
  }

  public broadcastToEvidence(evidenceId: string, event: string, data: any): void {
    if (this.io) {
      this.io.to(`evidence:${evidenceId}`).emit(event, data);
    }
  }

  public getApp(): express.Application {
    return this.app;
  }

  public getServer(): Server | null {
    return this.server;
  }

  public getWebSocketServer(): SocketIOServer | null {
    return this.io;
  }
}

// Global variable for WebSocket server access
export let io: SocketIOServer | null = null;

// Function to set the WebSocket server instance
export const setWebSocketServer = (socketServer: SocketIOServer) => {
  io = socketServer;
};

export default Application;