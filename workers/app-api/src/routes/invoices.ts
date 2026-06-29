import { Hono } from "hono";
import type { PrismaClient } from "@inova/db";
import type { Env, TenantContext, AuthUser } from "../types";
import { verifyJwt, timingSafeEqual } from "../auth";
import { hasPermission } from "../rbac";
import { getDb, resolveConnectionString } from "../db/client";
import { writeAuditLog } from "../db/audit-store";
import { issueInvoice, listInvoices, updateInvoiceFromWebhook } from "../db/invoices-store";
import { resolveNfse } from "../integrations/nfse";

type InvoiceVars = { tenant: TenantContext; user: AuthUser; db: PrismaClient | null };

export const invoiceRoutes = new Hono<{ Bindings: Env; Variables: InvoiceVars }>();

invoiceRoutes.use("*", async (c, next) => {
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

// Emite uma NFS-e (a partir de um recebível ou de valor/cliente avulsos).
invoiceRoutes.post("/", async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  if (!hasPermission(user.role, "finance:write")) return c.json({ error: "Forbidden" }, 403);

  const body = await c.req
    .json<{ receivableId?: string; serviceDescription?: string; amount?: string; customerName?: string }>()
    .catch(() => null);
  if (!body?.serviceDescription) return c.json({ error: "serviceDescription é obrigatório" }, 400);

  const result = await issueInvoice(
    c.get("db"),
    tenant.tenantId,
    { receivableId: body.receivableId, serviceDescription: body.serviceDescription, amount: body.amount, customerName: body.customerName },
    resolveNfse(c.env),
  );
  if (result === null) return c.json({ error: "Recebível não encontrado" }, 404);
  if ("error" in result) return c.json({ error: result.error }, 400);

  await writeAuditLog(c.get("db"), {
    tenantId: tenant.tenantId,
    actorId: user.userId,
    action: "invoice.issued",
    resource: result.id,
    payload: { provider: result.providerId, status: result.status },
  }).catch((e) => console.error(JSON.stringify({ level: "error", message: "audit.write_failed", detail: String(e) })));

  return c.json({ data: result }, 201);
});

invoiceRoutes.get("/", async (c) => {
  const tenant = c.get("tenant");
  const items = await listInvoices(c.get("db"), tenant.tenantId);
  return c.json({ data: items });
});

// ---- Webhook do provedor de NFS-e (fora de /api/*; M2M, assinado por HMAC) ----

export const nfseWebhookRoutes = new Hono<{ Bindings: Env }>();

async function verifySignature(secret: string, rawBody: string, signature: string | undefined): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return timingSafeEqual(signature, btoa(String.fromCharCode(...new Uint8Array(expected))));
}

nfseWebhookRoutes.post("/nfse", async (c) => {
  const raw = await c.req.text();
  if (!(await verifySignature(c.env.VPS_WEBHOOK_SECRET, raw, c.req.header("X-Signature")))) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const body = JSON.parse(raw) as {
    providerId?: string;
    externalReference?: string;
    status?: string;
    number?: string;
    pdfUrl?: string;
    xmlUrl?: string;
  };
  if (!body.providerId || !body.externalReference || !body.status) {
    return c.json({ received: true, skipped: true });
  }
  const tenantId = body.externalReference.split(":")[0];
  if (!tenantId) return c.json({ received: true, skipped: true });

  const db = await getDb(resolveConnectionString(c.env));
  const result = await updateInvoiceFromWebhook(db, tenantId, body.providerId, {
    status: body.status,
    number: body.number,
    pdfUrl: body.pdfUrl,
    xmlUrl: body.xmlUrl,
  });
  if (result) {
    await writeAuditLog(db, { tenantId, action: "invoice.updated", resource: result.id, payload: { status: body.status } }).catch(() => {});
  }
  return c.json({ received: true, matched: !!result });
});
