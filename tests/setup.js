"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
// Global test setup
(0, globals_1.beforeAll)(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://test_user:test_pass@localhost:5432/test_evidence_platform';
    process.env.REDIS_URL = 'redis://localhost:6380';
    process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing-purposes-only';
    process.env.SESSION_SECRET = 'test-session-secret-key-for-testing-purposes-only';
});
(0, globals_1.beforeEach)(async () => {
    // Clear any existing timers
    jest.clearAllTimers();
    jest.clearAllMocks();
});
(0, globals_1.afterEach)(async () => {
    // Clean up after each test
    jest.restoreAllMocks();
});
(0, globals_1.afterAll)(async () => {
    // Global cleanup
});
//# sourceMappingURL=setup.js.map