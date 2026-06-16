import type { Context, Next } from "hono";
import type { Env, TenantContext } from "../types";

const TENANT_ID = "X-Tenant-Id";
const BRANCH_ID = "X-Branch-Id";
const CORRELATION_ID = "X-Correlation-Id";

export function extractTenantContext(req: Request): TenantContext | null {
  const tenantId = req.headers.get(TENANT_ID);
  const correlationId = req.headers.get(CORRELATION_ID) ?? crypto.randomUUID();
  if (!tenantId) return null;
  return {
    tenantId,
    branchId: req.headers.get(BRANCH_ID) ?? undefined,
    correlationId,
  };
}

export function requireTenantContext() {
  return async (c: Context<{ Bindings: Env; Variables: { tenant: TenantContext } }>, next: Next) => {
    const tenant = extractTenantContext(c.req.raw);
    if (!tenant) {
      return c.json({ error: "Missing X-Tenant-Id or X-Correlation-Id" }, 400);
    }
    c.set("tenant", tenant);
    await next();
  };
}
