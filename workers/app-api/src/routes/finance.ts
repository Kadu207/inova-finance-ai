import { Hono } from "hono";
import { createEvent } from "@inova/events";
import type { PrismaClient } from "@inova/db";
import type { Env, TenantContext, AuthUser } from "../types";
import { verifyJwt } from "../auth";
import { hasPermission } from "../rbac";
import { getDb, resolveConnectionString } from "../db/client";
import { writeAuditLog } from "../db/audit-store";
import {
  listPayables,
  createPayable,
  listReceivables,
  createReceivable,
  getCashFlow,
  getAgenda,
} from "../db/finance-store";

type FinanceVars = { tenant: TenantContext; user: AuthUser; db: PrismaClient | null };

export const financeRoutes = new Hono<{ Bindings: Env; Variables: FinanceVars }>();

financeRoutes.use("*", async (c, next) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  const user = await verifyJwt(token, c.env.JWT_SECRET);
  if (!user) return c.json({ error: "Invalid token" }, 401);
  if (!hasPermission(user.role, "finance:read")) return c.json({ error: "Forbidden" }, 403);

  // C1 — Isolamento multitenant (NON-NEGOTIABLE): o tenant de TODA query é
  // derivado do JWT assinado, nunca do header X-Tenant-Id (controlado pelo
  // cliente). Um header forjado/divergente não pode mais pivotar para outro
  // tenant. O header serve apenas como pista/correlação.
  const headerTenant = c.get("tenant");
  if (headerTenant.tenantId !== user.tenantId) {
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "tenant.header_mismatch",
        headerTenantId: headerTenant.tenantId,
        jwtTenantId: user.tenantId,
        correlationId: headerTenant.correlationId,
      }),
    );
  }
  c.set("tenant", { ...headerTenant, tenantId: user.tenantId, userId: user.userId });
  c.set("user", user);
  c.set("db", await getDb(resolveConnectionString(c.env)));
  await next();
});

financeRoutes.get("/payables", async (c) => {
  const tenant = c.get("tenant");
  const items = await listPayables(c.get("db"), tenant.tenantId);
  return c.json({ data: items });
});

financeRoutes.post("/payables", async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  if (!hasPermission(user.role, "finance:write")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json<{
    supplierName: string;
    amount: string;
    dueDate: string;
    branchId: string;
    costCenterId?: string;
  }>();
  const idempotencyKey = c.req.header("X-Idempotency-Key") ?? crypto.randomUUID();

  const payable = await createPayable(c.get("db"), tenant.tenantId, {
    supplierName: body.supplierName,
    amount: body.amount,
    dueDate: body.dueDate,
    branchId: body.branchId,
    costCenterId: body.costCenterId,
    idempotencyKey,
  });

  const event = createEvent(
    "PayableCreated",
    { tenantId: tenant.tenantId, correlationId: tenant.correlationId, idempotencyKey },
    { payableId: payable.id, amount: body.amount, dueDate: body.dueDate },
  );
  await c.env.EVENTS_QUEUE.send(event);

  await writeAuditLog(c.get("db"), {
    tenantId: tenant.tenantId,
    actorId: user.userId,
    action: "payable.created",
    resource: payable.id,
    payload: { amount: body.amount, dueDate: body.dueDate },
  }).catch((e) => console.error(JSON.stringify({ level: "error", message: "audit.write_failed", detail: String(e) })));

  return c.json({ data: payable }, 201);
});

financeRoutes.get("/receivables", async (c) => {
  const tenant = c.get("tenant");
  const items = await listReceivables(c.get("db"), tenant.tenantId);
  return c.json({ data: items });
});

financeRoutes.post("/receivables", async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  if (!hasPermission(user.role, "finance:write")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json<{
    customerName: string;
    amount: string;
    dueDate: string;
    branchId: string;
    costCenterId?: string;
  }>();
  const idempotencyKey = c.req.header("X-Idempotency-Key") ?? crypto.randomUUID();

  const receivable = await createReceivable(c.get("db"), tenant.tenantId, {
    customerName: body.customerName,
    amount: body.amount,
    dueDate: body.dueDate,
    branchId: body.branchId,
    costCenterId: body.costCenterId,
    idempotencyKey,
  });

  const event = createEvent(
    "ReceivableCreated",
    { tenantId: tenant.tenantId, correlationId: tenant.correlationId, idempotencyKey },
    { receivableId: receivable.id, amount: body.amount, dueDate: body.dueDate },
  );
  await c.env.EVENTS_QUEUE.send(event);

  await writeAuditLog(c.get("db"), {
    tenantId: tenant.tenantId,
    actorId: user.userId,
    action: "receivable.created",
    resource: receivable.id,
    payload: { amount: body.amount, dueDate: body.dueDate },
  }).catch((e) => console.error(JSON.stringify({ level: "error", message: "audit.write_failed", detail: String(e) })));

  return c.json({ data: receivable }, 201);
});

financeRoutes.get("/cash-flow", async (c) => {
  const tenant = c.get("tenant");
  const data = await getCashFlow(c.get("db"), tenant.tenantId);
  return c.json({ data });
});

financeRoutes.get("/agenda", async (c) => {
  const tenant = c.get("tenant");
  const items = await getAgenda(c.get("db"), tenant.tenantId);
  return c.json({ data: items });
});
