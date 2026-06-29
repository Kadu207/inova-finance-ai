import { describe, it, expect, beforeEach } from "vitest";
import app from "../app";
import type { Env } from "../types";
import { signJwt } from "../auth";
import { createLocalEnv } from "../local-env";
import { resetDbCacheForTests } from "../db/client";
import { __memoryStoresForTests } from "../db/finance-store";
import { __costCentersMemoryForTests } from "../db/dre-store";

const env: Env = createLocalEnv();

function tokenFor(tenantId: string, role = "finance"): Promise<string> {
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
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "X-Tenant-Id": tenantId,
          "X-Correlation-Id": "t",
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
      env,
    ),
  );
}

describe("DRE + centro de custo", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetDbCacheForTests();
    const { payables, receivables } = __memoryStoresForTests();
    payables.clear();
    receivables.clear();
    __costCentersMemoryForTests().ccMemory.clear();
  });

  it("cria centro de custo e rejeita código duplicado (409)", async () => {
    const t = await tokenFor("da");
    const ok = await call("POST", "/api/dre/cost-centers", t, "da", { name: "Marketing", code: "MKT" });
    expect(ok.status).toBe(201);
    const dup = await call("POST", "/api/dre/cost-centers", t, "da", { name: "Mkt 2", code: "MKT" });
    expect(dup.status).toBe(409);
  });

  it("nega criação de centro de custo para viewer (403)", async () => {
    const viewer = await tokenFor("da", "viewer");
    const res = await call("POST", "/api/dre/cost-centers", viewer, "da", { name: "X", code: "X" });
    expect(res.status).toBe(403);
  });

  it("DRE agrupa por centro de custo (receita − despesa) no período", async () => {
    const t = await tokenFor("da");
    const cc = (await (await call("POST", "/api/dre/cost-centers", t, "da", { name: "Marketing", code: "MKT" })).json()) as { data: { id: string } };
    const ccId = cc.data.id;

    await call("POST", "/api/finance/receivables", t, "da", { customerName: "C", amount: "500.00", dueDate: "2026-09-10", branchId: "branch_main", costCenterId: ccId });
    await call("POST", "/api/finance/payables", t, "da", { supplierName: "F", amount: "200.00", dueDate: "2026-09-15", branchId: "branch_main", costCenterId: ccId });
    // título fora do período não entra
    await call("POST", "/api/finance/payables", t, "da", { supplierName: "Out", amount: "999.00", dueDate: "2026-10-01", branchId: "branch_main", costCenterId: ccId });

    const dre = (await (await call("GET", "/api/dre?period=2026-09", t, "da")).json()) as {
      data: { byCostCenter: Array<{ costCenterId: string | null; revenue: number; expense: number; net: number }>; total: { net: number } };
    };
    const row = dre.data.byCostCenter.find((r) => r.costCenterId === ccId)!;
    expect(row.revenue).toBe(500);
    expect(row.expense).toBe(200);
    expect(row.net).toBe(300);
    expect(dre.data.total.net).toBe(300);
  });
});
