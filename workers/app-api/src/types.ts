export interface Env {
  ENVIRONMENT: string;
  JWT_SECRET: string;
  VPS_WEBHOOK_SECRET: string;
  HYPERDRIVE: Hyperdrive;
  SESSIONS: KVNamespace;
  MESSAGING: Fetcher;
  EVENTS_QUEUE: Queue;
}

export interface TenantContext {
  tenantId: string;
  branchId?: string;
  correlationId: string;
  userId?: string;
}

export interface AuthUser {
  userId: string;
  email: string;
  tenantId: string;
  role: string;
  branchIds: string[];
}
