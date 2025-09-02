import { beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';

// Global test setup
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test_user:test_pass@localhost:5432/test_evidence_platform';
  process.env.REDIS_URL = 'redis://localhost:6380';
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing-purposes-only';
  process.env.SESSION_SECRET = 'test-session-secret-key-for-testing-purposes-only';
});

beforeEach(async () => {
  // Clear any existing timers
  jest.clearAllTimers();
  jest.clearAllMocks();
});

afterEach(async () => {
  // Clean up after each test
  jest.restoreAllMocks();
});

afterAll(async () => {
  // Global cleanup
});