export const TENANT_HEADERS = {
  TENANT_ID: "X-Tenant-Id",
  BRANCH_ID: "X-Branch-Id",
  CORRELATION_ID: "X-Correlation-Id",
  IDEMPOTENCY_KEY: "X-Idempotency-Key",
} as const;

export function mockTenantHeaders(overrides: Partial<Record<string, string>> = {}) {
  return {
    [TENANT_HEADERS.TENANT_ID]: "tenant_test_001",
    [TENANT_HEADERS.BRANCH_ID]: "branch_test_001",
    [TENANT_HEADERS.CORRELATION_ID]: "corr_test_001",
    ...overrides,
  };
}

export function createMockEnv(overrides: Record<string, unknown> = {}) {
  return {
    ENVIRONMENT: "test",
    JWT_SECRET: "test-jwt-secret-min-32-chars-long!",
    ...overrides,
  };
}
