import { Hono } from "hono";
import type { PrismaClient } from "@inova/db";
import type { Env, TenantContext, AuthUser } from "../types";
import { verifyJwt, timingSafeEqual } from "../auth";
import { hasPermission } from "../rbac";
import { getDb, resolveConnectionString } from "../db/client";
import { writeAuditLog } from "../db/audit-store";
import { createCharge, listCharges, markChargePaid } from "../db/charges-store";
import { resolvePsp } from "../integrations/psp";

type ChargeVars = { tenant: TenantContext; user: AuthUser; db: PrismaClient | null };

export const chargesRoutes = new Hono<{ Bindings: Env; Variables: ChargeVars }>();

chargesRoutes.use("*", async (c, next) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  const user = await verifyJwt(token, c.env.JWT_SECRET);
  if (!user) return c.json({ error: "Invalid token" }, 401);
  if (!hasPermission(user.role, "finance:read")) return c.json({ error: "Forbidden" }, 403);
  c.set("tenant", { ...c.get("tenant"), tenantId: user.tenantId, userId: user.userId });
  c.set("user", user);
  c.set("db", await getDb(resolveConnectionString(c.env)));
  await next();
});

// Emite boleto/PIX para um recebível aberto (via PSP; stub se ASAAS_API_KEY ausente).
chargesRoutes.post("/", async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  if (!hasPermission(user.role, "finance:write")) return c.json({ error: "Forbidden" }, 403);

  const body = await c.req.json<{ receivableId: string; method: "boleto" | "pix" }>().catch(() => null);
  if (!body?.receivableId || (body.method !== "boleto" && body.method !== "pix")) {
    return c.json({ error: "receivableId e method (boleto|pix) são obrigatórios" }, 400);
  }

  const charge = await createCharge(c.get("db"), tenant.tenantId, body, resolvePsp(c.env));
  if (!charge) return c.json({ error: "Recebível não encontrado ou não está aberto" }, 404);

  await writeAuditLog(c.get("db"), {
    tenantId: tenant.tenantId,
    actorId: user.userId,
    action: "charge.created",
    resource: charge.id,
    payload: { method: charge.method, provider: charge.providerId },
  }).catch((e) => console.error(JSON.stringify({ level: "error", message: "audit.write_failed", detail: String(e) })));

  return c.json({ data: charge }, 201);
});

chargesRoutes.get("/", async (c) => {
  const tenant = c.get("tenant");
  const items = await listCharges(c.get("db"), tenant.tenantId);
  return c.json({ data: items });
});

// ---- Webhook do PSP (montado fora de /api/*; M2M, assinado por HMAC) ----

export const pspWebhookRoutes = new Hono<{ Bindings: Env }>();

async function verifySignature(secret: string, rawBody: string, signature: string | undefined): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return timingSafeEqual(signature, btoa(String.fromCharCode(...new Uint8Array(expected))));
}

pspWebhookRoutes.post("/psp", async (c) => {
  const raw = await c.req.text();
  if (!(await verifySignature(c.env.VPS_WEBHOOK_SECRET, raw, c.req.header("X-Signature")))) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const body = JSON.parse(raw) as { event?: string; providerId?: string; externalReference?: string };
  const confirmed =
    body.event === "payment.confirmed" || body.event === "PAYMENT_RECEIVED" || body.event === "PAYMENT_CONFIRMED";
  if (!confirmed || !body.providerId || !body.externalReference) {
    return c.json({ received: true, skipped: true });
  }

  // O tenant vem da referência assinada (tenantId:receivableId), não de header.
  const tenantId = body.externalReference.split(":")[0];
  if (!tenantId) return c.json({ received: true, skipped: true });

  const db = await getDb(resolveConnectionString(c.env));
  const result = await markChargePaid(db, tenantId, body.providerId);
  if (result) {
    await writeAuditLog(db, {
      tenantId,
      action: "charge.paid",
      resource: result.id,
      payload: { receivableId: result.receivableId },
    }).catch(() => {});
  }
  return c.json({ received: true, matched: !!result });
});
