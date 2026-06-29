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

const OFX = [
  "<OFX><BANKTRANLIST>",
  "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260901<TRNAMT>-100.00<FITID>TX1<NAME>F</STMTTRN>",
  "<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260901<TRNAMT>250.00<FITID>TX2<NAME>C</STMTTRN>",
  "</BANKTRANLIST></OFX>",
].join("\n");

type Txn = { id: string; type: string; status: string; match: { id: string } | null };

describe("Conciliação US2 (revisão/ajuste manual)", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetDbCacheForTests();
    const { payables, receivables } = __memoryStoresForTests();
    payables.clear();
    receivables.clear();
    const { txnsMemory, matchesMemory, sessionsMemory } = __reconciliationMemoryForTests();
    txnsMemory.clear();
    matchesMemory.clear();
    sessionsMemory.clear();
  });

  it("rejeitar um match estorna o título (volta a open) e o lançamento a unmatched", async () => {
    const t = await tokenFor("ra");
    await call("POST", "/api/finance/payables", t, "ra", { supplierName: "F", amount: "100.00", dueDate: "2026-09-01", branchId: "branch_main" });
    await call("POST", "/api/reconciliation/import", t, "ra", { bankAccountId: "ba1", ofx: OFX });

    const txns = (await (await call("GET", "/api/reconciliation/transactions", t, "ra")).json()) as { data: Txn[] };
    const matched = txns.data.find((x) => x.status === "matched")!;
    expect(matched.match).toBeTruthy();

    const rej = await call("POST", `/api/reconciliation/matches/${matched.match!.id}/reject`, t, "ra");
    expect(rej.status).toBe(200);

    const pays = (await (await call("GET", "/api/finance/payables", t, "ra")).json()) as { data: Array<{ status: string }> };
    expect(pays.data[0]!.status).toBe("open"); // estornado
    const txns2 = (await (await call("GET", "/api/reconciliation/transactions", t, "ra")).json()) as { data: Txn[] };
    expect(txns2.data.find((x) => x.id === matched.id)!.status).toBe("unmatched");
  });

  it("casar manualmente um lançamento não conciliado baixa o título escolhido", async () => {
    const t = await tokenFor("ra");
    // importa antes de existir AR → o crédito TX2 fica unmatched
    await call("POST", "/api/reconciliation/import", t, "ra", { bankAccountId: "ba1", ofx: OFX });
    const rec = (await (await call("POST", "/api/finance/receivables", t, "ra", { customerName: "C", amount: "250.00", dueDate: "2026-09-01", branchId: "branch_main" })).json()) as { data: { id: string } };

    const txns = (await (await call("GET", "/api/reconciliation/transactions", t, "ra")).json()) as { data: Txn[] };
    const credit = txns.data.find((x) => x.type === "credit")!;
    expect(credit.status).toBe("unmatched");

    const manual = await call("POST", "/api/reconciliation/matches", t, "ra", {
      bankTransactionId: credit.id,
      resourceType: "receivable",
      resourceId: rec.data.id,
    });
    expect(manual.status).toBe(201);

    const recs = (await (await call("GET", "/api/finance/receivables", t, "ra")).json()) as { data: Array<{ id: string; status: string }> };
    expect(recs.data.find((r) => r.id === rec.data.id)!.status).toBe("paid");
  });

  it("nega reject para viewer (403)", async () => {
    const viewer = await tokenFor("ra", "viewer");
    const res = await call("POST", "/api/reconciliation/matches/x/reject", viewer, "ra");
    expect(res.status).toBe(403);
  });
});
