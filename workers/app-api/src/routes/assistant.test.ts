import { describe, it, expect, beforeEach } from "vitest";
import app from "../app";
import type { Env } from "../types";
import { signJwt } from "../auth";
import { createLocalEnv } from "../local-env";
import { resetDbCacheForTests } from "../db/client";
import { __memoryStoresForTests } from "../db/finance-store";

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

describe("Assistente financeiro (escopado por tenant, sem alucinação)", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.OPENROUTER_API_KEY;
    resetDbCacheForTests();
    const { payables, receivables } = __memoryStoresForTests();
    payables.clear();
    receivables.clear();
  });

  it("exige autenticação (sem token → 401)", async () => {
    const res = await call("POST", "/api/assistant", "", "ta", { question: "qual meu saldo?" });
    expect(res.status).toBe(401);
  });

  it("responde saldo com o valor REAL do tenant (determinístico)", async () => {
    const t = await tokenFor("ta");
    await call("POST", "/api/finance/payables", t, "ta", {
      supplierName: "F",
      amount: "100.00",
      dueDate: "2026-09-01",
      branchId: "branch_main",
    });
    await call("POST", "/api/finance/receivables", t, "ta", {
      customerName: "C",
      amount: "250.00",
      dueDate: "2026-09-01",
      branchId: "branch_main",
    });
    const res = await call("POST", "/api/assistant", t, "ta", { question: "qual meu saldo líquido?" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { intent: string; source: string; facts: { net: number }; answer: string } };
    expect(json.data.intent).toBe("balance");
    expect(json.data.source).toBe("deterministic");
    expect(json.data.facts.net).toBe(150); // 250 - 100
    expect(json.data.answer).toContain("150");
  });

  it("não vaza dados de outro tenant (saldo do tenant B = 0)", async () => {
    const tA = await tokenFor("ta");
    await call("POST", "/api/finance/payables", tA, "ta", {
      supplierName: "F",
      amount: "999.00",
      dueDate: "2026-09-01",
      branchId: "branch_main",
    });
    const tB = await tokenFor("tb");
    const res = await call("POST", "/api/assistant", tB, "tb", { question: "qual meu saldo?" });
    const json = (await res.json()) as { data: { facts: { net: number } } };
    expect(json.data.facts.net).toBe(0);
  });

  it("recusa educadamente perguntas fora de escopo (sem inventar)", async () => {
    const t = await tokenFor("ta");
    const res = await call("POST", "/api/assistant", t, "ta", { question: "qual a capital da França?" });
    const json = (await res.json()) as { data: { intent: string; answer: string } };
    expect(json.data.intent).toBe("unknown");
    expect(json.data.answer).toContain("Posso responder sobre");
  });
});
