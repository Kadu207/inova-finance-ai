import { describe, it, expect } from "vitest";
import app from "../app";
import type { Env } from "../types";
import { createLocalEnv } from "../local-env";

const env: Env = createLocalEnv();

async function sign(body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.VPS_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function post(path: string, body: string, headers: Record<string, string>): Promise<Response> {
  return Promise.resolve(
    app.fetch(
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": "demo-tenant", "X-Correlation-Id": "t", ...headers },
        body,
      }),
      env,
    ),
  );
}

describe("Integrations webhooks — assinatura HMAC obrigatória", () => {
  const body = JSON.stringify({ event: "message_created", id: 1, conversation: { id: 9 }, content: "oi" });

  it("nega chatwoot/webhook sem assinatura (401)", async () => {
    const res = await post("/api/integrations/chatwoot/webhook", body, {});
    expect(res.status).toBe(401);
  });

  it("nega chatwoot/webhook com assinatura forjada (401)", async () => {
    const res = await post("/api/integrations/chatwoot/webhook", body, { "X-Signature": "forjada" });
    expect(res.status).toBe(401);
  });

  it("aceita chatwoot/webhook com assinatura válida (200)", async () => {
    const res = await post("/api/integrations/chatwoot/webhook", body, { "X-Signature": await sign(body) });
    expect(res.status).toBe(200);
  });

  it("nega ocr/callback sem assinatura (401)", async () => {
    const res = await post("/api/integrations/ocr/callback", JSON.stringify({ jobId: "j1", documentType: "boleto" }), {});
    expect(res.status).toBe(401);
  });
});
