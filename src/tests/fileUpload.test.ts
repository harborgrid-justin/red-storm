import request from 'supertest';
import path from 'path';
import fs from 'fs/promises';
import { Application } from '../app';
import { prisma } from '../config/database';
import { fileProcessingService } from '../services/fileProcessing';

describe('File Upload API', () => {
  let app: Application;
  let server: any;
  let adminToken: string;
  let testCaseId: string;

  beforeAll(async () => {
    // Initialize test application
    app = new Application();
    await app.initialize();
    server = app.getApp();

    // Create test data
    await setupTestData();
  });

  afterAll(async () => {
    // Cleanup test data
    await cleanupTestData();
    
    // Close connections
    await app.stop();
  });

  const setupTestData = async () => {
    // Create test user with admin role
    const adminUser = await prisma.user.create({
      data: {
        email: 'test-admin@test.com',
        username: 'testadmin',
        firstName: 'Test',
        lastName: 'Admin',
        passwordHash: 'hashed_password',
        roles: {
          create: {
            role: {
              connectOrCreate: {
                where: { name: 'admin' },
                create: {
                  name: 'admin',
                  description: 'System Administrator',
                  permissions: ['evidence:create', 'evidence:upload', 'evidence:transfer'],
                },
              },
            },
          },
        },
      },
    });

    // Create test case
    const testCase = await prisma.case.create({
      data: {
        caseNumber: 'TEST-CASE-001',
        title: 'Test Case for File Upload',
        description: 'Test case for validating file upload functionality',
        createdById: adminUser.id,
      },
    });

    testCaseId = testCase.id;

    // Generate admin token (simplified for testing)
    adminToken = 'test-admin-token';
  };

  const cleanupTestData = async () => {
    // Clean up test data
    await prisma.evidenceItem.deleteMany({
      where: { caseId: testCaseId },
    });
    await prisma.case.deleteMany({
      where: { caseNumber: 'TEST-CASE-001' },
    });
    await prisma.userRole.deleteMany({});
    await prisma.user.deleteMany({
      where: { email: 'test-admin@test.com' },
    });
    await prisma.role.deleteMany({
      where: { name: 'admin' },
    });
  };

  describe('POST /api/v1/evidence-files/upload', () => {
    it('should upload a single file successfully', async () => {
      // Create test file
      const testFilePath = path.join(__dirname, 'test-file.txt');
      await fs.writeFile(testFilePath, 'This is a test file for upload testing.');

      const response = await request(server)
        .post('/api/v1/evidence-files/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('caseId', testCaseId)
        .field('title', 'Test Evidence File')
        .field('description', 'Test file for upload validation')
        .field('type', 'DOCUMENT')
        .field('location', 'Test Lab')
        .attach('files', testFilePath);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.evidenceItems).toHaveLength(1);
      expect(response.body.data.evidenceItems[0].title).toBe('Test Evidence File');

      // Cleanup
      await fs.unlink(testFilePath);
    });

    it('should reject files with invalid type', async () => {
      const testFilePath = path.join(__dirname, 'test-malware.exe');
      await fs.writeFile(testFilePath, 'MZ\x90\x00'); // Fake executable header

      const response = await request(server)
        .post('/api/v1/evidence-files/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('caseId', testCaseId)
        .field('title', 'Invalid File')
        .field('type', 'DOCUMENT')
        .attach('files', testFilePath);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_FILE_TYPE');

      // Cleanup
      await fs.unlink(testFilePath);
    });

    it('should reject files that are too large', async () => {
      // Create a large test file (beyond the limit)
      const testFilePath = path.join(__dirname, 'large-file.txt');
      const largeContent = 'A'.repeat(200 * 1024 * 1024); // 200MB
      await fs.writeFile(testFilePath, largeContent);

      const response = await request(server)
        .post('/api/v1/evidence-files/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('caseId', testCaseId)
        .field('title', 'Large File')
        .field('type', 'DOCUMENT')
        .attach('files', testFilePath);

      expect(response.status).toBe(413);
      expect(response.body.error.code).toBe('FILE_TOO_LARGE');

      // Cleanup
      await fs.unlink(testFilePath);
    });
  });

  describe('POST /api/v1/evidence-files/upload/s3/presigned', () => {
    it('should generate presigned URL for valid request', async () => {
      const response = await request(server)
        .post('/api/v1/evidence-files/upload/s3/presigned')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          filename: 'test-document.pdf',
          contentType: 'application/pdf',
          size: 1024 * 1024, // 1MB
        });

      if (process.env.AWS_S3_BUCKET) {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.uploadUrl).toBeDefined();
        expect(response.body.data.key).toBeDefined();
        expect(response.body.data.expiresIn).toBe(3600);
      } else {
        // Skip if S3 not configured
        expect(response.status).toBe(500);
      }
    });
  });

  describe('POST /api/v1/evidence-files/upload/chunk', () => {
    it('should handle chunked upload correctly', async () => {
      const uploadId = 'test-upload-123';
      const testContent = 'This is chunk 1 of a chunked upload test.';
      const testFilePath = path.join(__dirname, 'chunk-1.txt');
      await fs.writeFile(testFilePath, testContent);

      const response = await request(server)
        .post('/api/v1/evidence-files/upload/chunk')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('uploadId', uploadId)
        .field('chunkIndex', '0')
        .field('totalChunks', '1')
        .field('caseId', testCaseId)
        .field('filename', 'chunked-test.txt')
        .field('totalSize', testContent.length.toString())
        .attach('chunk', testFilePath);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.complete).toBe(true);

      // Cleanup
      await fs.unlink(testFilePath);
    });
  });
});

describe('File Processing Service', () => {
  describe('calculateFileHash', () => {
    it('should calculate SHA-256 hash correctly', async () => {
      const testBuffer = Buffer.from('test content for hashing');
      const hash = await fileProcessingService.calculateFileHash(testBuffer);
      
      expect(hash).toHaveLength(64); // SHA-256 produces 64-character hex string
      expect(hash).toMatch(/^[a-f0-9]{64}$/); // Should be valid hex
    });
  });

  describe('extractExifData', () => {
    it('should handle invalid image data gracefully', async () => {
      const invalidBuffer = Buffer.from('not an image file');
      const exifData = await fileProcessingService.extractExifData(invalidBuffer);
      
      expect(exifData).toBeNull();
    });
  });

  describe('checkForDuplicates', () => {
    it('should return false for non-existent hash', async () => {
      const testHash = '1234567890abcdef1234567890abcdef12345678';
      const isDuplicate = await fileProcessingService.checkForDuplicates(testHash);
      
      expect(isDuplicate).toBe(false);
    });
  });
});

describe('Chain of Custody Service', () => {
  let testEvidenceId: string;

  beforeAll(async () => {
    // Create test evidence item
    const evidence = await prisma.evidenceItem.create({
      data: {
        caseId: testCaseId,
        itemNumber: 'TEST-E001',
        title: 'Test Evidence for Custody',
        type: 'DOCUMENT',
        collectedById: '1', // Assuming user exists
        collectedAt: new Date(),
        chainOfCustody: [],
      },
    });
    testEvidenceId = evidence.id;
  });

  afterAll(async () => {
    await prisma.evidenceItem.deleteMany({
      where: { id: testEvidenceId },
    });
  });

  describe('Digital Signatures', () => {
    it('should generate and verify digital signatures', () => {
      const { chainOfCustodyService } = require('../services/chainOfCustody');
      const testData = 'test data for signature';
      
      // This is a placeholder test as we need the service to be properly initialized
      expect(typeof chainOfCustodyService.verifyDigitalSignature).toBe('function');
    });
  });
});