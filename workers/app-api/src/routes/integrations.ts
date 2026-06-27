import { Hono } from "hono";
import { createEvent } from "@inova/events";
import type { Env, TenantContext } from "../types";
import { timingSafeEqual } from "../auth";

type IntegrationVars = { tenant: TenantContext };

export const integrationRoutes = new Hono<{ Bindings: Env; Variables: IntegrationVars }>();

/**
 * Verifica a assinatura HMAC-SHA256 do corpo cru com VPS_WEBHOOK_SECRET, em tempo
 * constante. Os webhooks de integração são máquina-a-máquina (chamados pelo relay/
 * bridges confiável, não por navegadores) — por isso usam assinatura HMAC e não JWT.
 * Sem assinatura válida a requisição é rejeitada, impedindo que qualquer um injete
 * eventos para um tenant arbitrário via header X-Tenant-Id forjado.
 */
async function verifySignature(secret: string, rawBody: string, signature: string | undefined): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(expected)));
  return timingSafeEqual(signature, expectedB64);
}

integrationRoutes.post("/chatwoot/webhook", async (c) => {
  const raw = await c.req.text();
  if (!(await verifySignature(c.env.VPS_WEBHOOK_SECRET, raw, c.req.header("X-Signature")))) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const tenant = c.get("tenant");
  const body = JSON.parse(raw) as {
    event: string;
    id: number;
    conversation?: { id: number };
    content?: string;
    inbox?: { channel_type: string };
  };

  if (body.event !== "message_created") {
    return c.json({ received: true, skipped: true });
  }

  const idempotencyKey = c.req.header("X-Idempotency-Key") ?? `cw-${body.id}`;
  const event = createEvent(
    "CustomerMessageReceived",
    { tenantId: tenant.tenantId, correlationId: tenant.correlationId, idempotencyKey },
    {
      conversationId: String(body.conversation?.id ?? 0),
      messageId: String(body.id),
      content: body.content ?? "",
      channel: body.inbox?.channel_type ?? "unknown",
    },
  );
  await c.env.EVENTS_QUEUE.send(event);

  return c.json({ received: true });
});

integrationRoutes.post("/n8n/callback", async (c) => {
  const raw = await c.req.text();
  // Aceita X-Signature (padrão) ou X-N8N-Signature (compatibilidade).
  const sig = c.req.header("X-Signature") ?? c.req.header("X-N8N-Signature");
  if (!(await verifySignature(c.env.VPS_WEBHOOK_SECRET, raw, sig))) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const tenant = c.get("tenant");
  return c.json({ received: true, tenantId: tenant.tenantId });
});

integrationRoutes.post("/ocr/callback", async (c) => {
  const raw = await c.req.text();
  if (!(await verifySignature(c.env.VPS_WEBHOOK_SECRET, raw, c.req.header("X-Signature")))) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const tenant = c.get("tenant");
  const body = JSON.parse(raw) as { jobId: string; documentType: string; confidence?: number };
  const idempotencyKey = c.req.header("X-Idempotency-Key") ?? `ocr-${body.jobId}`;

  const event = createEvent(
    "OcrJobCompleted",
    { tenantId: tenant.tenantId, correlationId: tenant.correlationId, idempotencyKey },
    { jobId: body.jobId, documentType: body.documentType, confidence: body.confidence },
  );
  await c.env.EVENTS_QUEUE.send(event);

  return c.json({ received: true });
});
