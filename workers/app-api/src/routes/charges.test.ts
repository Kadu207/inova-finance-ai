import { describe, it, expect, beforeEach } from "vitest";
import app from "../app";
import type { Env } from "../types";
import { signJwt } from "../auth";
import { createLocalEnv } from "../local-env";
import { resetDbCacheForTests } from "../db/client";
import { __memoryStoresForTests } from "../db/finance-store";
import { __chargesMemoryForTests } from "../db/charges-store";

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

async function sign(body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.VPS_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function webhook(body: string, signature?: string): Promise<Response> {
  return Promise.resolve(
    app.fetch(
      new Request("http://localhost/webhooks/psp", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(signature ? { "X-Signature": signature } : {}) },
        body,
      }),
      env,
    ),
  );
}

async function createReceivable(token: string, tenantId: string, amount = "200.00"): Promise<string> {
  const res = (await (await call("POST", "/api/finance/receivables", token, tenantId, { customerName: "C", amount, dueDate: "2026-09-01", branchId: "branch_main" })).json()) as { data: { id: string } };
  return res.data.id;
}

describe("Boleto/PIX — cobranças via PSP + webhook", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.ASAAS_API_KEY;
    resetDbCacheForTests();
    const { payables, receivables } = __memoryStoresForTests();
    payables.clear();
    receivables.clear();
    __chargesMemoryForTests().chargesMemory.clear();
  });

  it("emite boleto para um recebível aberto (stub)", async () => {
    const t = await tokenFor("ca");
    const recId = await createReceivable(t, "ca");
    const res = await call("POST", "/api/charges", t, "ca", { receivableId: recId, method: "boleto" });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { method: string; boletoUrl: string | null; pixCode: string | null } };
    expect(json.data.method).toBe("boleto");
    expect(json.data.boletoUrl).toContain("boleto");
    expect(json.data.pixCode).toBeNull();
  });

  it("emite PIX com copia-e-cola", async () => {
    const t = await tokenFor("ca");
    const recId = await createReceivable(t, "ca");
    const res = await call("POST", "/api/charges", t, "ca", { receivableId: recId, method: "pix" });
    const json = (await res.json()) as { data: { pixCode: string | null } };
    expect(json.data.pixCode).toBeTruthy();
  });

  it("nega emissão para viewer (403)", async () => {
    const viewer = await tokenFor("ca", "viewer");
    const res = await call("POST", "/api/charges", viewer, "ca", { receivableId: "x", method: "pix" });
    expect(res.status).toBe(403);
  });

  it("webhook assinado de pagamento confirmado baixa o recebível", async () => {
    const t = await tokenFor("ca");
    const recId = await createReceivable(t, "ca");
    const charge = (await (await call("POST", "/api/charges", t, "ca", { receivableId: recId, method: "pix" })).json()) as { data: { providerId: string } };

    const wbody = JSON.stringify({ event: "payment.confirmed", providerId: charge.data.providerId, externalReference: `ca:${recId}` });
    const res = await webhook(wbody, await sign(wbody));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { matched: boolean }).matched).toBe(true);

    const recs = (await (await call("GET", "/api/finance/receivables", t, "ca")).json()) as { data: Array<{ id: string; status: string }> };
    expect(recs.data.find((r) => r.id === recId)!.status).toBe("paid");
  });

  it("webhook sem assinatura → 401", async () => {
    const res = await webhook(JSON.stringify({ event: "payment.confirmed" }));
    expect(res.status).toBe(401);
  });
});
