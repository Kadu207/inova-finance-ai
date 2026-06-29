export interface Env {
  ENVIRONMENT: string;
  JWT_SECRET: string;
  VPS_WEBHOOK_SECRET: string;
  HYPERDRIVE: Hyperdrive;
  SESSIONS: KVNamespace;
  MESSAGING: Fetcher;
  EVENTS_QUEUE: Queue;
  /** Opcional — habilita o LLM do assistente (OpenRouter). Sem ele, respostas determinísticas. */
  OPENROUTER_API_KEY?: string;
  /** Opcional — habilita o PSP real (Asaas) para boleto/PIX. Sem ele, provider stub. */
  ASAAS_API_KEY?: string;
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
