import { INA_PORTS } from "@inova/config";

const DIRECT_API = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

/** Browser uses same-origin proxy in dev unless explicit API URL is set. */
export const API_BASE =
  DIRECT_API ?? (typeof window !== "undefined" ? "/api/proxy" : `http://127.0.0.1:${INA_PORTS.appApi}`);

export type ApiContext = {
  tenantId: string;
  branchId?: string;
  correlationId?: string;
  token?: string;
};

function buildHeaders(ctx: ApiContext): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Tenant-Id": ctx.tenantId,
    ...(ctx.branchId ? { "X-Branch-Id": ctx.branchId } : {}),
    "X-Correlation-Id": ctx.correlationId ?? (typeof crypto !== "undefined" ? crypto.randomUUID() : `corr-${Date.now()}`),
    ...(ctx.token ? { Authorization: `Bearer ${ctx.token}` } : {}),
  };
}

let defaultContext: ApiContext = { tenantId: "demo-tenant", branchId: "branch_main" };

export function setApiContext(ctx: Partial<ApiContext>) {
  defaultContext = { ...defaultContext, ...ctx };
}

async function request<T>(method: string, path: string, body?: unknown, ctx?: Partial<ApiContext>): Promise<T> {
  const headers = buildHeaders({ ...defaultContext, ...ctx });
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      DIRECT_API
        ? `API indisponível em ${API_BASE}. Inicie: pnpm --filter @inova/app-api dev`
        : "API indisponível. Inicie primeiro: pnpm --filter @inova/app-api dev",
    );
  }
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string; mfaRequired?: boolean } | null;
    const err = new Error(payload?.error ?? `API ${res.status}`) as Error & { mfaRequired?: boolean };
    err.mfaRequired = payload?.mfaRequired;
    throw err;
  }
  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string, ctx?: Partial<ApiContext>) => request<T>("GET", path, undefined, ctx),
  post: <T>(path: string, body: unknown, ctx?: Partial<ApiContext>) => request<T>("POST", path, body, ctx),
};
