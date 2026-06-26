import { describe, it, expect, beforeEach } from "vitest";
import app from "../app";
import { signJwt } from "../auth";
import { createLocalEnv } from "../local-env";
import { resetDbCacheForTests } from "../db/client";
import { __memoryStoresForTests } from "../db/finance-store";

const env = createLocalEnv();

type PayableList = { data: Array<{ tenantId: string; supplierName: string }> };
type PayableCreated = { data: { tenantId: string } };

function authHeaders(token: string, tenantId: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "X-Tenant-Id": tenantId,
    "X-Correlation-Id": "test-corr",
  };
}

function tokenFor(tenantId: string, role = "finance"): Promise<string> {
  return signJwt(
    { userId: `u-${tenantId}`, email: `user@${tenantId}.test`, tenantId, role, branchIds: ["branch_main"] },
    env.JWT_SECRET,
  );
}

async function call(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<Response> {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
  );
}

describe("Finance tenant isolation (C1)", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetDbCacheForTests();
    const { payables, receivables } = __memoryStoresForTests();
    payables.clear();
    receivables.clear();
  });

  it("creates a payable scoped to the JWT tenant", async () => {
    const tokenA = await tokenFor("tenant-a");
    const res = await call("POST", "/api/finance/payables", authHeaders(tokenA, "tenant-a"), {
      supplierName: "Fornecedor A",
      amount: "100.00",
      dueDate: "2026-07-01",
      branchId: "branch_main",
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as PayableCreated;
    expect(json.data.tenantId).toBe("tenant-a");
  });

  it("does NOT leak another tenant's data via a forged X-Tenant-Id header", async () => {
    // tenant A grava um título sigiloso
    const tokenA = await tokenFor("tenant-a");
    await call("POST", "/api/finance/payables", authHeaders(tokenA, "tenant-a"), {
      supplierName: "Segredo A",
      amount: "999.00",
      dueDate: "2026-07-01",
      branchId: "branch_main",
    });

    // tenant B tenta ler os dados de A falsificando o header para "tenant-a"
    const tokenB = await tokenFor("tenant-b");
    const res = await call("GET", "/api/finance/payables", authHeaders(tokenB, "tenant-a"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as PayableList;
    // Escopo vem do JWT (tenant-b): o título de A NÃO pode aparecer.
    expect(json.data).toHaveLength(0);
    expect(JSON.stringify(json.data)).not.toContain("Segredo A");
  });

  it("scopes queries by the JWT even when the header points elsewhere", async () => {
    const tokenA = await tokenFor("tenant-a");
    await call("POST", "/api/finance/payables", authHeaders(tokenA, "tenant-a"), {
      supplierName: "Fornecedor A",
      amount: "50.00",
      dueDate: "2026-07-01",
      branchId: "branch_main",
    });
    // Mesmo token A, mas header alega tenant-b → ainda retorna os dados de A.
    const res = await call("GET", "/api/finance/payables", authHeaders(tokenA, "tenant-b"));
    const json = (await res.json()) as PayableList;
    expect(json.data).toHaveLength(1);
    expect(json.data[0]!.tenantId).toBe("tenant-a");
  });

  it("rejects requests without a token", async () => {
    const res = await call("GET", "/api/finance/payables", {
      "Content-Type": "application/json",
      "X-Tenant-Id": "tenant-a",
    });
    expect(res.status).toBe(401);
  });

  it("forbids finance:write for the viewer role", async () => {
    const viewer = await tokenFor("tenant-a", "viewer");
    const res = await call("POST", "/api/finance/payables", authHeaders(viewer, "tenant-a"), {
      supplierName: "X",
      amount: "1.00",
      dueDate: "2026-07-01",
      branchId: "branch_main",
    });
    expect(res.status).toBe(403);
  });
});
