import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWTPayload } from '@/types';
import { config } from '@/config';

// Password hashing
export const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, config.security.bcryptSaltRounds);
};

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return await bcrypt.compare(password, hash);
};

// JWT token generation and verification
export const generateAccessToken = (payload: Omit<JWTPayload, 'type' | 'iat' | 'exp'>): string => {
  return jwt.sign(
    { ...payload, type: 'access' },
    config.jwt.secret,
    { 
      expiresIn: config.jwt.expiresIn,
      issuer: 'evidence-platform',
      audience: 'evidence-platform-api',
    }
  );
};

export const generateRefreshToken = (payload: Omit<JWTPayload, 'type' | 'iat' | 'exp'>): string => {
  return jwt.sign(
    { ...payload, type: 'refresh' },
    config.jwt.refreshSecret,
    { 
      expiresIn: config.jwt.refreshExpiresIn,
      issuer: 'evidence-platform',
      audience: 'evidence-platform-api',
    }
  );
};

export const verifyAccessToken = (token: string): JWTPayload => {
  return jwt.verify(token, config.jwt.secret) as JWTPayload;
};

export const verifyRefreshToken = (token: string): JWTPayload => {
  return jwt.verify(token, config.jwt.refreshSecret) as JWTPayload;
};

// Random string generation
export const generateRandomString = (length = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};

export const generateSecureToken = (length = 32): string => {
  return crypto.randomBytes(length).toString('base64url');
};

// Cryptographic functions
export const encrypt = (text: string, key?: string): { encrypted: string; iv: string } => {
  const algorithm = 'aes-256-gcm';
  const secretKey = key || config.jwt.secret;
  const keyHash = crypto.createHash('sha256').update(secretKey).digest();
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipher(algorithm, keyHash);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return {
    encrypted,
    iv: iv.toString('hex'),
  };
};

export const decrypt = (encryptedData: { encrypted: string; iv: string }, key?: string): string => {
  const algorithm = 'aes-256-gcm';
  const secretKey = key || config.jwt.secret;
  const keyHash = crypto.createHash('sha256').update(secretKey).digest();
  
  const decipher = crypto.createDecipher(algorithm, keyHash);
  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
};

// File hash generation
export const generateFileHash = (buffer: Buffer): { md5: string; sha256: string } => {
  const md5 = crypto.createHash('md5').update(buffer).digest('hex');
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  
  return { md5, sha256 };
};

// UUID generation (alternative to cuid)
export const generateUUID = (): string => {
  return crypto.randomUUID();
};

// HMAC signature generation and verification
export const generateHMAC = (data: string, secret?: string): string => {
  const key = secret || config.jwt.secret;
  return crypto.createHmac('sha256', key).update(data).digest('hex');
};

export const verifyHMAC = (data: string, signature: string, secret?: string): boolean => {
  const expectedSignature = generateHMAC(data, secret);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
};

// Time-based one-time password (TOTP) for 2FA
export const generateTOTP = (secret: string, window = 0): string => {
  const epoch = Math.round(new Date().getTime() / 1000.0);
  const time = Math.floor(epoch / 30) + window;
  
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeUInt32BE(Math.floor(time / Math.pow(2, 32)), 0);
  timeBuffer.writeUInt32BE(time % Math.pow(2, 32), 4);
  
  const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'base32'));
  const digest = hmac.update(timeBuffer).digest();
  
  const offset = digest[digest.length - 1] & 0x0f;
  const otp = ((digest[offset] & 0x7f) << 24) |
              ((digest[offset + 1] & 0xff) << 16) |
              ((digest[offset + 2] & 0xff) << 8) |
              (digest[offset + 3] & 0xff);
  
  return (otp % Math.pow(10, 6)).toString().padStart(6, '0');
};

export const verifyTOTP = (token: string, secret: string, window = 1): boolean => {
  for (let i = -window; i <= window; i++) {
    const expectedToken = generateTOTP(secret, i);
    if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken))) {
      return true;
    }
  }
  return false;
};

// Data sanitization
export const sanitizeInput = (input: string): string => {
  return input
    .trim()
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/[<>]/g, '');
};

export const sanitizeHtml = (input: string): string => {
  const htmlTags = /<\/?[^>]+(>|$)/g;
  return input.replace(htmlTags, '');
};

// Rate limiting key generation
export const generateRateLimitKey = (identifier: string, action: string): string => {
  return `ratelimit:${action}:${identifier}`;
};

// Session token generation
export const generateSessionToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

// API key generation
export const generateApiKey = (): { key: string; secret: string } => {
  const key = 'evp_' + crypto.randomBytes(16).toString('hex');
  const secret = crypto.randomBytes(32).toString('hex');
  
  return { key, secret };
};

// Hash API key for storage
export const hashApiKey = (key: string): string => {
  return crypto.createHash('sha256').update(key).digest('hex');
};

export default {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateRandomString,
  generateSecureToken,
  encrypt,
  decrypt,
  generateFileHash,
  generateUUID,
  generateHMAC,
  verifyHMAC,
  generateTOTP,
  verifyTOTP,
  sanitizeInput,
  sanitizeHtml,
  generateRateLimitKey,
  generateSessionToken,
  generateApiKey,
  hashApiKey,
};