import { config } from './config';
import { logger } from './config/logger';
import Application from './app';

async function bootstrap(): Promise<void> {
  try {
    // Log startup information
    logger.info('Starting Evidence Management Platform', {
      version: config.apiVersion,
      environment: config.env,
      nodeVersion: process.version,
    });

    // Create and initialize application
    const app = new Application();
    await app.initialize();
    await app.start();

    logger.info('Application started successfully', {
      port: config.port,
      environment: config.env,
    });

  } catch (error) {
    logger.error('Failed to start application', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// Handle unhandled promise rejections and uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at Promise', {
    reason,
    promise,
  });
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception thrown', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

// Start the application
bootstrap();