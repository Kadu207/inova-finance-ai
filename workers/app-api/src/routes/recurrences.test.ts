import { describe, it, expect, beforeEach } from "vitest";
import app from "../app";
import type { Env } from "../types";
import { signJwt } from "../auth";
import { createLocalEnv } from "../local-env";
import { resetDbCacheForTests } from "../db/client";
import { __memoryStoresForTests } from "../db/finance-store";
import { __recurrencesMemoryForTests } from "../db/recurrences-store";

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

describe("Recorrências (títulos recorrentes mensais)", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetDbCacheForTests();
    const { payables, receivables } = __memoryStoresForTests();
    payables.clear();
    receivables.clear();
    __recurrencesMemoryForTests().recMemory.clear();
  });

  it("cria recorrência e gera o título do mês (idempotente em reexecução)", async () => {
    const t = await tokenFor("ra");
    await call("POST", "/api/recurrences", t, "ra", { type: "payable", name: "Aluguel", amount: "1500.00", dayOfMonth: 10, branchId: "branch_main" });

    const run1 = (await (await call("POST", "/api/recurrences/run", t, "ra", { month: "2026-09" })).json()) as { data: { processed: number } };
    expect(run1.data.processed).toBe(1);

    const pays1 = (await (await call("GET", "/api/finance/payables", t, "ra")).json()) as { data: Array<{ dueDate: string }> };
    expect(pays1.data).toHaveLength(1);
    expect(pays1.data[0]!.dueDate).toBe("2026-09-10");

    // reexecutar o mesmo mês não duplica
    await call("POST", "/api/recurrences/run", t, "ra", { month: "2026-09" });
    const pays2 = (await (await call("GET", "/api/finance/payables", t, "ra")).json()) as { data: unknown[] };
    expect(pays2.data).toHaveLength(1);
  });

  it("valida entrada (dayOfMonth inválido → 400)", async () => {
    const t = await tokenFor("ra");
    const res = await call("POST", "/api/recurrences", t, "ra", { type: "payable", name: "A", amount: "1.00", dayOfMonth: 0, branchId: "branch_main" });
    expect(res.status).toBe(400);
  });

  it("nega criação para viewer (403)", async () => {
    const viewer = await tokenFor("ra", "viewer");
    const res = await call("POST", "/api/recurrences", viewer, "ra", { type: "payable", name: "A", amount: "1.00", dayOfMonth: 5, branchId: "branch_main" });
    expect(res.status).toBe(403);
  });
});
