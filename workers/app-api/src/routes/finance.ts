import { Hono } from "hono";
import { createEvent } from "@inova/events";
import type { Env, TenantContext } from "../types";
import { verifyJwt } from "../auth";
import { hasPermission } from "../rbac";
import {
  listPayables,
  createPayable,
  listReceivables,
  createReceivable,
  getCashFlow,
  getAgenda,
} from "../db/finance-store";

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

financeRoutes.get("/payables", async (c) => {
  const tenant = c.get("tenant");
  const items = await listPayables(tenant.tenantId);
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

  const payable = await createPayable(tenant.tenantId, {
    supplierName: body.supplierName,
    amount: body.amount,
    dueDate: body.dueDate,
    branchId: body.branchId,
    idempotencyKey,
  });

  const event = createEvent(
    "PayableCreated",
    { tenantId: tenant.tenantId, correlationId: tenant.correlationId, idempotencyKey },
    { payableId: payable.id, amount: body.amount, dueDate: body.dueDate },
  );
  await c.env.EVENTS_QUEUE.send(event);

  return c.json({ data: payable }, 201);
});

financeRoutes.get("/receivables", async (c) => {
  const tenant = c.get("tenant");
  const items = await listReceivables(tenant.tenantId);
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

  const receivable = await createReceivable(tenant.tenantId, {
    customerName: body.customerName,
    amount: body.amount,
    dueDate: body.dueDate,
    branchId: body.branchId,
    idempotencyKey,
  });

  const event = createEvent(
    "ReceivableCreated",
    { tenantId: tenant.tenantId, correlationId: tenant.correlationId, idempotencyKey },
    { receivableId: receivable.id, amount: body.amount, dueDate: body.dueDate },
  );
  await c.env.EVENTS_QUEUE.send(event);

  return c.json({ data: receivable }, 201);
});

financeRoutes.get("/cash-flow", async (c) => {
  const tenant = c.get("tenant");
  const data = await getCashFlow(tenant.tenantId);
  return c.json({ data });
});

financeRoutes.get("/agenda", async (c) => {
  const tenant = c.get("tenant");
  const items = await getAgenda(tenant.tenantId);
  return c.json({ data: items });
});
