import { Hono } from "hono";
import { createEvent } from "@inova/events";
import type { Env, TenantContext } from "../types";
import { timingSafeEqual } from "../auth";

type IntegrationVars = { tenant: TenantContext };

export const integrationRoutes = new Hono<{ Bindings: Env; Variables: IntegrationVars }>();

integrationRoutes.post("/chatwoot/webhook", async (c) => {
  const tenant = c.get("tenant");
  const body = await c.req.json<{
    event: string;
    id: number;
    conversation?: { id: number };
    content?: string;
    inbox?: { channel_type: string };
  }>();

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
  const signature = c.req.header("X-N8N-Signature");
  if (!signature) return c.json({ error: "Missing signature" }, 401);

  const tenant = c.get("tenant");
  const body = await c.req.text();

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(c.env.VPS_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(expected)));
  if (!timingSafeEqual(signature, expectedB64)) return c.json({ error: "Invalid signature" }, 401);

  return c.json({ received: true, tenantId: tenant.tenantId });
});

integrationRoutes.post("/ocr/callback", async (c) => {
  const tenant = c.get("tenant");
  const body = await c.req.json<{ jobId: string; documentType: string; confidence?: number }>();
  const idempotencyKey = c.req.header("X-Idempotency-Key") ?? `ocr-${body.jobId}`;

  const event = createEvent(
    "OcrJobCompleted",
    { tenantId: tenant.tenantId, correlationId: tenant.correlationId, idempotencyKey },
    { jobId: body.jobId, documentType: body.documentType, confidence: body.confidence },
  );
  await c.env.EVENTS_QUEUE.send(event);

  return c.json({ received: true });
});
