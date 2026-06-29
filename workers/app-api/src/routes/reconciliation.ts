import { Hono } from "hono";
import { createEvent } from "@inova/events";
import type { PrismaClient } from "@inova/db";
import type { Env, TenantContext, AuthUser } from "../types";
import { verifyJwt } from "../auth";
import { hasPermission } from "../rbac";
import { getDb, resolveConnectionString } from "../db/client";
import { writeAuditLog } from "../db/audit-store";
import { importStatement, listBankTransactions, confirmMatch, rejectMatch, createManualMatch } from "../db/reconciliation-store";

type ReconVars = { tenant: TenantContext; user: AuthUser; db: PrismaClient | null };

export const reconciliationRoutes = new Hono<{ Bindings: Env; Variables: ReconVars }>();

function audit(db: PrismaClient | null, actorId: string, tenantId: string, action: string, resource: string) {
  return writeAuditLog(db, { tenantId, actorId, action, resource }).catch((e) =>
    console.error(JSON.stringify({ level: "error", message: "audit.write_failed", detail: String(e) })),
  );
}

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

// Lista os lançamentos bancários (matched/unmatched) com o match ativo — revisão (US2).
reconciliationRoutes.get("/transactions", async (c) => {
  const tenant = c.get("tenant");
  const items = await listBankTransactions(c.get("db"), tenant.tenantId);
  return c.json({ data: items });
});

// US2 — confirmar um match sugerido.
reconciliationRoutes.post("/matches/:id/confirm", async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  if (!hasPermission(user.role, "finance:write")) return c.json({ error: "Forbidden" }, 403);
  const result = await confirmMatch(c.get("db"), tenant.tenantId, c.req.param("id"));
  if (!result) return c.json({ error: "Match não encontrado" }, 404);
  await audit(c.get("db"), user.userId, tenant.tenantId, "reconciliation.match.confirm", result.id);
  return c.json({ data: result });
});

// US2 — rejeitar/desfazer um match (estorna o título).
reconciliationRoutes.post("/matches/:id/reject", async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  if (!hasPermission(user.role, "finance:write")) return c.json({ error: "Forbidden" }, 403);
  const result = await rejectMatch(c.get("db"), tenant.tenantId, c.req.param("id"));
  if (!result) return c.json({ error: "Match não encontrado" }, 404);
  await audit(c.get("db"), user.userId, tenant.tenantId, "reconciliation.match.reject", result.id);
  return c.json({ data: result });
});

// US2 — casar manualmente um lançamento com um título aberto.
reconciliationRoutes.post("/matches", async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  if (!hasPermission(user.role, "finance:write")) return c.json({ error: "Forbidden" }, 403);
  const body = await c.req.json<{ bankTransactionId: string; resourceType: "payable" | "receivable"; resourceId: string }>().catch(() => null);
  if (!body?.bankTransactionId || !body?.resourceType || !body?.resourceId) {
    return c.json({ error: "bankTransactionId, resourceType e resourceId são obrigatórios" }, 400);
  }
  const result = await createManualMatch(c.get("db"), tenant.tenantId, body);
  if (!result) return c.json({ error: "Lançamento ou título não encontrado/aberto" }, 404);
  await audit(c.get("db"), user.userId, tenant.tenantId, "reconciliation.match.manual", result.id);
  return c.json({ data: result }, 201);
});
