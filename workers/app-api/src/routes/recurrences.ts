import { Hono } from "hono";
import type { PrismaClient } from "@inova/db";
import type { Env, TenantContext, AuthUser } from "../types";
import { verifyJwt } from "../auth";
import { hasPermission } from "../rbac";
import { getDb, resolveConnectionString } from "../db/client";
import { writeAuditLog } from "../db/audit-store";
import { createRecurrence, listRecurrences, runRecurrences } from "../db/recurrences-store";

type RecVars = { tenant: TenantContext; user: AuthUser; db: PrismaClient | null };

export const recurrenceRoutes = new Hono<{ Bindings: Env; Variables: RecVars }>();

recurrenceRoutes.use("*", async (c, next) => {
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

recurrenceRoutes.post("/", async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  if (!hasPermission(user.role, "finance:write")) return c.json({ error: "Forbidden" }, 403);

  const body = await c.req
    .json<{ type?: string; name?: string; amount?: string; dayOfMonth?: number; branchId?: string; costCenterId?: string }>()
    .catch(() => null);
  if (
    (body?.type !== "payable" && body?.type !== "receivable") ||
    !body?.name ||
    !body?.amount ||
    !body?.branchId ||
    typeof body?.dayOfMonth !== "number" ||
    body.dayOfMonth < 1 ||
    body.dayOfMonth > 31
  ) {
    return c.json({ error: "type (payable|receivable), name, amount, dayOfMonth (1-31) e branchId são obrigatórios" }, 400);
  }

  const rec = await createRecurrence(c.get("db"), tenant.tenantId, {
    type: body.type,
    name: body.name,
    amount: body.amount,
    dayOfMonth: body.dayOfMonth,
    branchId: body.branchId,
    costCenterId: body.costCenterId,
  });
  await writeAuditLog(c.get("db"), { tenantId: tenant.tenantId, actorId: user.userId, action: "recurrence.created", resource: rec.id }).catch(() => {});
  return c.json({ data: rec }, 201);
});

recurrenceRoutes.get("/", async (c) => {
  const tenant = c.get("tenant");
  return c.json({ data: await listRecurrences(c.get("db"), tenant.tenantId) });
});

// Gera os títulos do mês para as recorrências ativas (idempotente). month = YYYY-MM (default: mês corrente).
recurrenceRoutes.post("/run", async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  if (!hasPermission(user.role, "finance:write")) return c.json({ error: "Forbidden" }, 403);
  const body = await c.req.json<{ month?: string }>().catch(() => ({}) as { month?: string });
  const month = body.month && /^\d{4}-\d{2}$/.test(body.month) ? body.month : new Date().toISOString().slice(0, 7);
  const result = await runRecurrences(c.get("db"), tenant.tenantId, month);
  await writeAuditLog(c.get("db"), { tenantId: tenant.tenantId, actorId: user.userId, action: "recurrence.run", resource: month, payload: result }).catch(() => {});
  return c.json({ data: { month, ...result } });
});
