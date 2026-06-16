import { validateEvent, type BaseEvent } from "@inova/events";

export interface Env {
  ENVIRONMENT: string;
  VPS_WEBHOOK_SECRET: string;
  VPS_WEBHOOK_URL: string;
  INBOUND_QUEUE: Queue;
  OUTBOUND_QUEUE: Queue;
  APP_API: Fetcher;
  OUTBOX: DurableObjectNamespace;
}

export interface OutboxRecord {
  id: string;
  tenantId: string;
  eventType: string;
  payload: unknown;
  idempotencyKey: string;
  correlationId: string;
  status: "pending" | "published" | "failed";
  attempts: number;
  createdAt: string;
}

export class OutboxDO {
  private state: DurableObjectState;
  private records: OutboxRecord[] = [];

  constructor(state: DurableObjectState) {
    this.state = state;
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<OutboxRecord[]>("records");
      this.records = stored ?? [];
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/append") {
      const event = (await request.json()) as OutboxRecord;
      const exists = this.records.find((r) => r.idempotencyKey === event.idempotencyKey);
      if (exists) return Response.json({ data: exists, duplicate: true });
      this.records.push(event);
      await this.state.storage.put("records", this.records);
      return Response.json({ data: event }, { status: 201 });
    }
    if (request.method === "GET" && url.pathname === "/pending") {
      const pending = this.records.filter((r) => r.status === "pending");
      return Response.json({ data: pending });
    }
    if (request.method === "POST" && url.pathname === "/mark-published") {
      const { id } = (await request.json()) as { id: string };
      const record = this.records.find((r) => r.id === id);
      if (record) record.status = "published";
      await this.state.storage.put("records", this.records);
      return Response.json({ ok: true });
    }
    return new Response("Not found", { status: 404 });
  }
}

async function deliverToVps(env: Env, event: BaseEvent): Promise<boolean> {
  const body = JSON.stringify(event);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.VPS_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));

  const res = await fetch(env.VPS_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature": signature,
      "X-Tenant-Id": event.tenantId,
      "X-Correlation-Id": event.correlationId,
      "X-Idempotency-Key": event.idempotencyKey,
    },
    body,
  });
  return res.ok;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "inova-messaging" });
    }

    // Webhook ingress (Chatwoot, N8N external)
    if (url.pathname === "/ingress" && request.method === "POST") {
      const tenantId = request.headers.get("X-Tenant-Id");
      const correlationId = request.headers.get("X-Correlation-Id") ?? crypto.randomUUID();
      if (!tenantId) return Response.json({ error: "Missing X-Tenant-Id" }, 400);

      const raw = await request.json();
      const event = validateEvent({
        ...raw,
        tenantId,
        correlationId,
        idempotencyKey: request.headers.get("X-Idempotency-Key") ?? crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      });

      await env.INBOUND_QUEUE.send(event);
      return Response.json({ enqueued: true });
    }

    // Outbox append
    if (url.pathname === "/outbox" && request.method === "POST") {
      const event = (await request.json()) as OutboxRecord;
      const id = env.OUTBOX.idFromName(event.tenantId);
      const stub = env.OUTBOX.get(id);
      return stub.fetch(new Request("https://outbox/append", { method: "POST", body: JSON.stringify(event) }));
    }

    return new Response("Not found", { status: 404 });
  },

  async queue(batch: MessageBatch<BaseEvent>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        const event = validateEvent(msg.body);
        const outboxId = env.OUTBOX.idFromName(event.tenantId);
        const stub = env.OUTBOX.get(outboxId);
        await stub.fetch(
          new Request("https://outbox/append", {
            method: "POST",
            body: JSON.stringify({
              id: crypto.randomUUID(),
              tenantId: event.tenantId,
              eventType: event.eventType,
              payload: event.payload,
              idempotencyKey: event.idempotencyKey,
              correlationId: event.correlationId,
              status: "pending",
              attempts: 0,
              createdAt: new Date().toISOString(),
            }),
          }),
        );

        if (env.VPS_WEBHOOK_URL) {
          await deliverToVps(env, event);
        }

        await env.OUTBOUND_QUEUE.send(event);
        msg.ack();
      } catch (err) {
        console.error(JSON.stringify({ level: "error", error: String(err) }));
        msg.retry();
      }
    }
  },
} satisfies ExportedHandler<Env>;
