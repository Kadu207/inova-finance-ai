import { describe, it, expect, beforeEach } from "vitest";
import app from "../app";
import type { Env } from "../types";
import { signJwt } from "../auth";
import { createLocalEnv } from "../local-env";
import { resetDbCacheForTests } from "../db/client";
import { __memoryStoresForTests } from "../db/finance-store";

const env: Env = createLocalEnv();

function tokenFor(tenantId: string, role: string): Promise<string> {
  return signJwt(
    { userId: `u-${tenantId}`, email: `a@${tenantId}.test`, tenantId, role, branchIds: ["branch_main"] },
    env.JWT_SECRET,
  );
}

function call(method: string, path: string, token: string, tenantId: string, body?: unknown): Promise<Response> {
  return Promise.resolve(
    app.fetch(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId,
          "X-Correlation-Id": "t",
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
      env,
    ),
  );
}

describe("LGPD export/erase (tenant:admin + tenant do JWT)", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetDbCacheForTests();
    const { payables, receivables } = __memoryStoresForTests();
    payables.clear();
    receivables.clear();
  });

  it("nega export para papel não-admin (finance → 403)", async () => {
    const t = await tokenFor("lgpd-a", "finance");
    const res = await call("GET", "/api/lgpd/export", t, "lgpd-a");
    expect(res.status).toBe(403);
  });

  it("exporta os dados do tenant para admin", async () => {
    const admin = await tokenFor("lgpd-a", "admin");
    await call("POST", "/api/finance/payables", admin, "lgpd-a", {
      supplierName: "Fornecedor X",
      amount: "10.00",
      dueDate: "2026-09-01",
      branchId: "branch_main",
    });
    const res = await call("GET", "/api/lgpd/export", admin, "lgpd-a");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { tenantId: string; payables: Array<{ supplierName: string }> } };
    expect(json.data.tenantId).toBe("lgpd-a");
    expect(json.data.payables.some((p) => p.supplierName === "Fornecedor X")).toBe(true);
  });

  it("apaga os dados do tenant (erase) e a listagem fica vazia", async () => {
    const admin = await tokenFor("lgpd-b", "admin");
    await call("POST", "/api/finance/payables", admin, "lgpd-b", {
      supplierName: "Y",
      amount: "5.00",
      dueDate: "2026-09-01",
      branchId: "branch_main",
    });
    const erase = await call("POST", "/api/lgpd/erase", admin, "lgpd-b");
    expect(erase.status).toBe(200);
    const list = await call("GET", "/api/finance/payables", admin, "lgpd-b");
    const json = (await list.json()) as { data: unknown[] };
    expect(json.data).toHaveLength(0);
  });
});
