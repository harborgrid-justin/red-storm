import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Environment validation schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_VERSION: z.string().default('v1'),
  
  // Database
  DATABASE_URL: z.string(),
  DATABASE_POOL_SIZE: z.coerce.number().default(10),
  DATABASE_TIMEOUT: z.coerce.number().default(30000),
  
  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().default(0),
  
  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  
  // Session
  SESSION_SECRET: z.string().min(32),
  SESSION_MAX_AGE: z.coerce.number().default(3600000),
  
  // Security
  BCRYPT_SALT_ROUNDS: z.coerce.number().default(12),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  
  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:3001'),
  CORS_CREDENTIALS: z.coerce.boolean().default(true),
  
  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_MAX_SIZE: z.string().default('20m'),
  LOG_MAX_FILES: z.string().default('14d'),
  
  // Service Discovery
  CONSUL_HOST: z.string().default('localhost'),
  CONSUL_PORT: z.coerce.number().default(8500),
  
  // External Services
  SAML_ENTRY_POINT: z.string().optional(),
  SAML_ISSUER: z.string().optional(),
  SAML_CERT_PATH: z.string().optional(),
  
  // File Upload
  MAX_FILE_SIZE: z.coerce.number().default(10485760), // 10MB
  UPLOAD_PATH: z.string().default('./uploads'),
  
  // GraphQL
  GRAPHQL_PLAYGROUND: z.coerce.boolean().default(true),
  GRAPHQL_INTROSPECTION: z.coerce.boolean().default(true),
  
  // WebSocket
  WEBSOCKET_CORS_ORIGIN: z.string().default('http://localhost:3001'),
});

// Validate environment variables
const env = envSchema.parse(process.env);

// Configuration object
export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  apiVersion: env.API_VERSION,
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  
  database: {
    url: env.DATABASE_URL,
    poolSize: env.DATABASE_POOL_SIZE,
    timeout: env.DATABASE_TIMEOUT,
  },
  
  redis: {
    url: env.REDIS_URL,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB,
  },
  
  jwt: {
    secret: env.JWT_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },
  
  session: {
    secret: env.SESSION_SECRET,
    maxAge: env.SESSION_MAX_AGE,
  },
  
  security: {
    bcryptSaltRounds: env.BCRYPT_SALT_ROUNDS,
    rateLimit: {
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    },
  },
  
  cors: {
    origin: env.CORS_ORIGIN,
    credentials: env.CORS_CREDENTIALS,
  },
  
  logging: {
    level: env.LOG_LEVEL,
    maxSize: env.LOG_MAX_SIZE,
    maxFiles: env.LOG_MAX_FILES,
  },
  
  consul: {
    host: env.CONSUL_HOST,
    port: env.CONSUL_PORT,
  },
  
  saml: {
    entryPoint: env.SAML_ENTRY_POINT,
    issuer: env.SAML_ISSUER,
    certPath: env.SAML_CERT_PATH,
  },
  
  upload: {
    maxFileSize: env.MAX_FILE_SIZE,
    uploadPath: env.UPLOAD_PATH,
  },
  
  graphql: {
    playground: env.GRAPHQL_PLAYGROUND,
    introspection: env.GRAPHQL_INTROSPECTION,
  },
  
  websocket: {
    corsOrigin: env.WEBSOCKET_CORS_ORIGIN,
  },
} as const;

export type Config = typeof config;