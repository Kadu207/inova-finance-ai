import { Hono } from "hono";
import { createEvent } from "@inova/events";
import type { Env, TenantContext } from "../types";
import { verifyJwt } from "../auth";
import { hasPermission } from "../rbac";

type FinanceVars = { tenant: TenantContext };

export const financeRoutes = new Hono<{ Bindings: Env; Variables: FinanceVars }>();

financeRoutes.use("*", async (c, next) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  const user = await verifyJwt(token, c.env.JWT_SECRET);
  if (!user) return c.json({ error: "Invalid token" }, 401);
  if (!hasPermission(user.role, "finance:read")) return c.json({ error: "Forbidden" }, 403);
  await next();
});

// In-memory store for MVP tests; production uses Hyperdrive + Prisma
const payablesStore = new Map<string, Record<string, unknown>>();
const receivablesStore = new Map<string, Record<string, unknown>>();

function scopedKey(tenantId: string, id: string) {
  return `${tenantId}:${id}`;
}

financeRoutes.get("/payables", (c) => {
  const tenant = c.get("tenant");
  const items = [...payablesStore.entries()]
    .filter(([k]) => k.startsWith(`${tenant.tenantId}:`))
    .map(([, v]) => v);
  return c.json({ data: items });
});

financeRoutes.post("/payables", async (c) => {
  const tenant = c.get("tenant");
  const token = c.req.header("Authorization")!.replace("Bearer ", "");
  const user = await verifyJwt(token, c.env.JWT_SECRET);
  if (!user || !hasPermission(user.role, "finance:write")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json<{
    supplierName: string;
    amount: string;
    dueDate: string;
    branchId: string;
  }>();
  const idempotencyKey = c.req.header("X-Idempotency-Key") ?? crypto.randomUUID();
  const existing = [...payablesStore.values()].find(
    (p) => p.tenantId === tenant.tenantId && p.idempotencyKey === idempotencyKey,
  );
  if (existing) return c.json({ data: existing });

  const id = crypto.randomUUID();
  const payable = {
    id,
    tenantId: tenant.tenantId,
    branchId: body.branchId,
    supplierName: body.supplierName,
    amount: body.amount,
    dueDate: body.dueDate,
    status: "open",
    idempotencyKey,
    createdAt: new Date().toISOString(),
  };
  payablesStore.set(scopedKey(tenant.tenantId, id), payable);

  const event = createEvent(
    "PayableCreated",
    { tenantId: tenant.tenantId, correlationId: tenant.correlationId, idempotencyKey },
    { payableId: id, amount: body.amount, dueDate: body.dueDate },
  );
  await c.env.EVENTS_QUEUE.send(event);

  return c.json({ data: payable }, 201);
});

financeRoutes.get("/receivables", (c) => {
  const tenant = c.get("tenant");
  const items = [...receivablesStore.entries()]
    .filter(([k]) => k.startsWith(`${tenant.tenantId}:`))
    .map(([, v]) => v);
  return c.json({ data: items });
});

financeRoutes.post("/receivables", async (c) => {
  const tenant = c.get("tenant");
  const token = c.req.header("Authorization")!.replace("Bearer ", "");
  const user = await verifyJwt(token, c.env.JWT_SECRET);
  if (!user || !hasPermission(user.role, "finance:write")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json<{
    customerName: string;
    amount: string;
    dueDate: string;
    branchId: string;
  }>();
  const idempotencyKey = c.req.header("X-Idempotency-Key") ?? crypto.randomUUID();

  const id = crypto.randomUUID();
  const receivable = {
    id,
    tenantId: tenant.tenantId,
    branchId: body.branchId,
    customerName: body.customerName,
    amount: body.amount,
    dueDate: body.dueDate,
    status: "open",
    idempotencyKey,
    createdAt: new Date().toISOString(),
  };
  receivablesStore.set(scopedKey(tenant.tenantId, id), receivable);

  const event = createEvent(
    "ReceivableCreated",
    { tenantId: tenant.tenantId, correlationId: tenant.correlationId, idempotencyKey },
    { receivableId: id, amount: body.amount, dueDate: body.dueDate },
  );
  await c.env.EVENTS_QUEUE.send(event);

  return c.json({ data: receivable }, 201);
});

financeRoutes.get("/cash-flow", (c) => {
  const tenant = c.get("tenant");
  const payables = [...payablesStore.values()].filter((p) => p.tenantId === tenant.tenantId && p.status === "open");
  const receivables = [...receivablesStore.values()].filter((r) => r.tenantId === tenant.tenantId && r.status === "open");
  const outflow = payables.reduce((s, p) => s + parseFloat(String(p.amount)), 0);
  const inflow = receivables.reduce((s, r) => s + parseFloat(String(r.amount)), 0);
  return c.json({ data: { inflow, outflow, net: inflow - outflow } });
});

financeRoutes.get("/agenda", (c) => {
  const tenant = c.get("tenant");
  const items = [
    ...[...payablesStore.values()]
      .filter((p) => p.tenantId === tenant.tenantId)
      .map((p) => ({ type: "payable", id: p.id, title: p.supplierName, dueDate: p.dueDate })),
    ...[...receivablesStore.values()]
      .filter((r) => r.tenantId === tenant.tenantId)
      .map((r) => ({ type: "receivable", id: r.id, title: r.customerName, dueDate: r.dueDate })),
  ];
  return c.json({ data: items });
});

export { payablesStore, receivablesStore };
