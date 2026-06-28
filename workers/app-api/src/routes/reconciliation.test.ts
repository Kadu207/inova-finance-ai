import { describe, it, expect, beforeEach } from "vitest";
import app from "../app";
import type { Env } from "../types";
import { signJwt } from "../auth";
import { createLocalEnv } from "../local-env";
import { resetDbCacheForTests } from "../db/client";
import { __memoryStoresForTests } from "../db/finance-store";
import { parseOfx, __reconciliationMemoryForTests } from "../db/reconciliation-store";

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

const OFX = [
  "<OFX><BANKMSGSRSV1><STMTTRNRS><BANKTRANLIST>",
  "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260901<TRNAMT>-100.00<FITID>TX1<NAME>Fornecedor A</STMTTRN>",
  "<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260901<TRNAMT>250.00<FITID>TX2<NAME>Cliente B</STMTTRN>",
  "</BANKTRANLIST></STMTTRNRS></BANKMSGSRSV1></OFX>",
].join("\n");

describe("parseOfx", () => {
  it("extrai lançamentos com tipo, valor absoluto e data ISO", () => {
    const txns = parseOfx(OFX);
    expect(txns).toHaveLength(2);
    expect(txns[0]).toMatchObject({ fitid: "TX1", amount: "100.00", type: "debit", date: "2026-09-01" });
    expect(txns[1]).toMatchObject({ fitid: "TX2", amount: "250.00", type: "credit", date: "2026-09-01" });
  });
});

describe("Conciliação US1 (import OFX + auto-match)", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetDbCacheForTests();
    const { payables, receivables } = __memoryStoresForTests();
    payables.clear();
    receivables.clear();
    const { txnsMemory, sessionsMemory } = __reconciliationMemoryForTests();
    txnsMemory.clear();
    sessionsMemory.clear();
  });

  it("exige finance:write para importar (viewer → 403)", async () => {
    const viewer = await tokenFor("ra", "viewer");
    const res = await call("POST", "/api/reconciliation/import", viewer, "ra", { bankAccountId: "ba1", ofx: OFX });
    expect(res.status).toBe(403);
  });

  it("importa e concilia automaticamente, baixando o título correspondente", async () => {
    const t = await tokenFor("ra");
    // título a pagar de 100,00 vencendo 2026-09-01 (casa com o débito TX1)
    await call("POST", "/api/finance/payables", t, "ra", {
      supplierName: "Fornecedor A",
      amount: "100.00",
      dueDate: "2026-09-01",
      branchId: "branch_main",
    });

    const res = await call("POST", "/api/reconciliation/import", t, "ra", { bankAccountId: "ba1", ofx: OFX });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { total: number; matched: number; unmatched: number } };
    expect(json.data.total).toBe(2);
    expect(json.data.matched).toBe(1); // só o débito casa (não há AR aberto p/ o crédito)

    // o título a pagar foi baixado
    const pays = (await (await call("GET", "/api/finance/payables", t, "ra")).json()) as { data: Array<{ status: string }> };
    expect(pays.data[0]!.status).toBe("paid");
  });

  it("é idempotente: reimportar o mesmo OFX não duplica lançamentos", async () => {
    const t = await tokenFor("ra");
    await call("POST", "/api/reconciliation/import", t, "ra", { bankAccountId: "ba1", ofx: OFX });
    await call("POST", "/api/reconciliation/import", t, "ra", { bankAccountId: "ba1", ofx: OFX });
    const txns = (await (await call("GET", "/api/reconciliation/transactions", t, "ra")).json()) as { data: unknown[] };
    expect(txns.data).toHaveLength(2);
  });

  it("não toca dados de outro tenant (isolamento)", async () => {
    const tA = await tokenFor("ra");
    await call("POST", "/api/finance/payables", tA, "ra", {
      supplierName: "A",
      amount: "100.00",
      dueDate: "2026-09-01",
      branchId: "branch_main",
    });
    // tenant B importa o mesmo OFX — não pode casar/baixar o título de A
    const tB = await tokenFor("rb");
    const res = await call("POST", "/api/reconciliation/import", tB, "rb", { bankAccountId: "ba1", ofx: OFX });
    const json = (await res.json()) as { data: { matched: number } };
    expect(json.data.matched).toBe(0);
    // título de A continua em aberto
    const pays = (await (await call("GET", "/api/finance/payables", tA, "ra")).json()) as { data: Array<{ status: string }> };
    expect(pays.data[0]!.status).toBe("open");
  });
});
