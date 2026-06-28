import { Hono } from "hono";
import { createEvent } from "@inova/events";
import type { PrismaClient } from "@inova/db";
import type { Env, TenantContext, AuthUser } from "../types";
import { verifyJwt } from "../auth";
import { hasPermission } from "../rbac";
import { getDb, resolveConnectionString } from "../db/client";
import { writeAuditLog } from "../db/audit-store";
import { importStatement, listBankTransactions } from "../db/reconciliation-store";

type ReconVars = { tenant: TenantContext; user: AuthUser; db: PrismaClient | null };

export const reconciliationRoutes = new Hono<{ Bindings: Env; Variables: ReconVars }>();

// JWT + finance:read; tenant derivado do JWT (C1); db resolvido uma vez.
reconciliationRoutes.use("*", async (c, next) => {
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

// US1 — importa OFX e concilia automaticamente.
reconciliationRoutes.post("/import", async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  if (!hasPermission(user.role, "finance:write")) return c.json({ error: "Forbidden" }, 403);

  const body = await c.req.json<{ bankAccountId: string; ofx: string; fileName?: string }>().catch(() => null);
  if (!body?.bankAccountId || !body?.ofx) {
    return c.json({ error: "bankAccountId e ofx são obrigatórios" }, 400);
  }

  const result = await importStatement(c.get("db"), tenant.tenantId, {
    bankAccountId: body.bankAccountId,
    ofx: body.ofx,
    fileName: body.fileName,
    correlationId: tenant.correlationId,
  });

  const idempotencyKey = c.req.header("X-Idempotency-Key") ?? `recon-${result.sessionId}`;
  const event = createEvent(
    "ReconciliationCompleted",
    { tenantId: tenant.tenantId, correlationId: tenant.correlationId, idempotencyKey },
    {
      sessionId: result.sessionId,
      bankAccountId: result.bankAccountId,
      total: result.total,
      matched: result.matched,
      unmatched: result.unmatched,
    },
  );
  await c.env.EVENTS_QUEUE.send(event);

  await writeAuditLog(c.get("db"), {
    tenantId: tenant.tenantId,
    actorId: user.userId,
    action: "reconciliation.import",
    resource: result.sessionId,
    payload: { total: result.total, matched: result.matched, unmatched: result.unmatched },
  }).catch((e) => console.error(JSON.stringify({ level: "error", message: "audit.write_failed", detail: String(e) })));

  return c.json({ data: result }, 201);
});

// Lista os lançamentos bancários (matched/unmatched) — base para a revisão (US2).
reconciliationRoutes.get("/transactions", async (c) => {
  const tenant = c.get("tenant");
  const items = await listBankTransactions(c.get("db"), tenant.tenantId);
  return c.json({ data: items });
});
