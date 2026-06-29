import { describe, it, expect, beforeEach } from "vitest";
import app from "../app";
import type { Env } from "../types";
import { signJwt } from "../auth";
import { createLocalEnv } from "../local-env";
import { resetDbCacheForTests } from "../db/client";
import { __memoryStoresForTests } from "../db/finance-store";
import { __reconciliationMemoryForTests } from "../db/reconciliation-store";

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

const OFX_DEBIT = [
  "<OFX><BANKTRANLIST>",
  "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260901<TRNAMT>-100.00<FITID>TX1<NAME>F</STMTTRN>",
  "</BANKTRANLIST></OFX>",
].join("\n");

type Txn = { id: string; type: string; status: string; match: { id: string; status: string; origin: string; confidence: number | null; reason: string | null } | null };

describe("Conciliação US4 (sugestão por IA / heurística com confidence)", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.OPENROUTER_API_KEY;
    resetDbCacheForTests();
    const { payables, receivables } = __memoryStoresForTests();
    payables.clear();
    receivables.clear();
    const { txnsMemory, matchesMemory, sessionsMemory } = __reconciliationMemoryForTests();
    txnsMemory.clear();
    matchesMemory.clear();
    sessionsMemory.clear();
  });

  it("ambíguo: import deixa unmatched; suggest cria sugestão com confiança; confirm baixa um título", async () => {
    const t = await tokenFor("ua");
    // dois títulos de 100 dentro da janela → ambíguo
    await call("POST", "/api/finance/payables", t, "ua", { supplierName: "F1", amount: "100.00", dueDate: "2026-09-01", branchId: "branch_main" });
    await call("POST", "/api/finance/payables", t, "ua", { supplierName: "F2", amount: "100.00", dueDate: "2026-09-03", branchId: "branch_main" });

    await call("POST", "/api/reconciliation/import", t, "ua", { bankAccountId: "ba1", ofx: OFX_DEBIT });

    const txns1 = (await (await call("GET", "/api/reconciliation/transactions", t, "ua")).json()) as { data: Txn[] };
    const debit = txns1.data.find((x) => x.type === "debit")!;
    expect(debit.status).toBe("unmatched"); // ambíguo → não auto-concilia
    expect(debit.match).toBeNull();

    const sug = (await (await call("POST", "/api/reconciliation/suggest", t, "ua")).json()) as { data: { suggested: number } };
    expect(sug.data.suggested).toBe(1);

    const txns2 = (await (await call("GET", "/api/reconciliation/transactions", t, "ua")).json()) as { data: Txn[] };
    const debit2 = txns2.data.find((x) => x.id === debit.id)!;
    expect(debit2.match).toBeTruthy();
    expect(debit2.match!.status).toBe("suggested");
    expect(debit2.match!.origin).toBe("ai");
    expect(typeof debit2.match!.confidence).toBe("number");
    expect(debit2.match!.confidence!).toBeGreaterThan(0);
    expect(debit2.match!.reason).toBeTruthy();

    await call("POST", `/api/reconciliation/matches/${debit2.match!.id}/confirm`, t, "ua");
    const pays = (await (await call("GET", "/api/finance/payables", t, "ua")).json()) as { data: Array<{ status: string }> };
    expect(pays.data.filter((p) => p.status === "paid")).toHaveLength(1); // exatamente um baixado
  });

  it("suggest é idempotente (não re-sugere quando já há sugestão ativa)", async () => {
    const t = await tokenFor("ua");
    await call("POST", "/api/finance/payables", t, "ua", { supplierName: "F1", amount: "100.00", dueDate: "2026-09-01", branchId: "branch_main" });
    await call("POST", "/api/finance/payables", t, "ua", { supplierName: "F2", amount: "100.00", dueDate: "2026-09-03", branchId: "branch_main" });
    await call("POST", "/api/reconciliation/import", t, "ua", { bankAccountId: "ba1", ofx: OFX_DEBIT });
    await call("POST", "/api/reconciliation/suggest", t, "ua");
    const again = (await (await call("POST", "/api/reconciliation/suggest", t, "ua")).json()) as { data: { suggested: number } };
    expect(again.data.suggested).toBe(0);
  });

  it("nega suggest para viewer (403)", async () => {
    const viewer = await tokenFor("ua", "viewer");
    const res = await call("POST", "/api/reconciliation/suggest", viewer, "ua");
    expect(res.status).toBe(403);
  });
});
