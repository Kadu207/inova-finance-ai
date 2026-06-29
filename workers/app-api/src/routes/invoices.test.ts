import { describe, it, expect, beforeEach } from "vitest";
import app from "../app";
import type { Env } from "../types";
import { signJwt } from "../auth";
import { createLocalEnv } from "../local-env";
import { resetDbCacheForTests } from "../db/client";
import { __memoryStoresForTests } from "../db/finance-store";
import { __invoicesMemoryForTests } from "../db/invoices-store";

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

function nfseWebhook(body: string, signature?: string): Promise<Response> {
  return Promise.resolve(
    app.fetch(
      new Request("http://localhost/webhooks/nfse", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(signature ? { "X-Signature": signature } : {}) },
        body,
      }),
      env,
    ),
  );
}

describe("NFS-e — emissão via provedor + webhook de status", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.NFSE_API_KEY;
    resetDbCacheForTests();
    const { payables, receivables } = __memoryStoresForTests();
    payables.clear();
    receivables.clear();
    __invoicesMemoryForTests().invoicesMemory.clear();
  });

  it("emite NFS-e avulsa (valor + cliente) — stub", async () => {
    const t = await tokenFor("na");
    const res = await call("POST", "/api/invoices", t, "na", { serviceDescription: "Consultoria", amount: "500.00", customerName: "ACME" });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { status: string; number: string | null; pdfUrl: string | null } };
    expect(json.data.status).toBe("issued");
    expect(json.data.number).toBeTruthy();
    expect(json.data.pdfUrl).toContain("nfse");
  });

  it("emite NFS-e a partir de um recebível (deriva valor/cliente)", async () => {
    const t = await tokenFor("na");
    const rec = (await (await call("POST", "/api/finance/receivables", t, "na", { customerName: "Cliente Z", amount: "320.00", dueDate: "2026-09-01", branchId: "branch_main" })).json()) as { data: { id: string } };
    const res = await call("POST", "/api/invoices", t, "na", { receivableId: rec.data.id, serviceDescription: "Serviço" });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { amount: string; customerName: string } };
    expect(json.data.amount).toBe("320.00");
    expect(json.data.customerName).toBe("Cliente Z");
  });

  it("exige serviceDescription (400)", async () => {
    const t = await tokenFor("na");
    const res = await call("POST", "/api/invoices", t, "na", { amount: "10.00", customerName: "X" });
    expect(res.status).toBe(400);
  });

  it("nega emissão para viewer (403)", async () => {
    const viewer = await tokenFor("na", "viewer");
    const res = await call("POST", "/api/invoices", viewer, "na", { serviceDescription: "X", amount: "1.00", customerName: "Y" });
    expect(res.status).toBe(403);
  });

  it("webhook assinado atualiza status/número da NFS-e", async () => {
    const t = await tokenFor("na");
    const inv = (await (await call("POST", "/api/invoices", t, "na", { serviceDescription: "S", amount: "100.00", customerName: "C" })).json()) as { data: { id: string; providerId: string } };
    const wbody = JSON.stringify({ providerId: inv.data.providerId, externalReference: `na:${inv.data.id}`, status: "issued", number: "NFSE-9999" });
    const res = await nfseWebhook(wbody, await sign(wbody));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { matched: boolean }).matched).toBe(true);
    const list = (await (await call("GET", "/api/invoices", t, "na")).json()) as { data: Array<{ id: string; number: string | null }> };
    expect(list.data.find((i) => i.id === inv.data.id)!.number).toBe("NFSE-9999");
  });

  it("webhook sem assinatura → 401", async () => {
    const res = await nfseWebhook(JSON.stringify({ providerId: "x" }));
    expect(res.status).toBe(401);
  });
});
