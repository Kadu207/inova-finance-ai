import { Hono } from "hono";
import type { PrismaClient } from "@inova/db";
import type { Env, TenantContext, AuthUser } from "../types";
import { verifyJwt } from "../auth";
import { hasPermission } from "../rbac";
import { getDb, resolveConnectionString } from "../db/client";
import { writeAuditLog } from "../db/audit-store";
import { createCostCenter, listCostCenters, getDre } from "../db/dre-store";

type DreVars = { tenant: TenantContext; user: AuthUser; db: PrismaClient | null };

export const dreRoutes = new Hono<{ Bindings: Env; Variables: DreVars }>();

dreRoutes.use("*", async (c, next) => {
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

dreRoutes.post("/cost-centers", async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  if (!hasPermission(user.role, "finance:write")) return c.json({ error: "Forbidden" }, 403);
  const body = await c.req.json<{ name?: string; code?: string }>().catch(() => null);
  if (!body?.name || !body?.code) return c.json({ error: "name e code são obrigatórios" }, 400);
  const result = await createCostCenter(c.get("db"), tenant.tenantId, { name: body.name, code: body.code });
  if ("error" in result) return c.json({ error: result.error }, 409);
  await writeAuditLog(c.get("db"), { tenantId: tenant.tenantId, actorId: user.userId, action: "costcenter.created", resource: result.id }).catch(() => {});
  return c.json({ data: result }, 201);
});

dreRoutes.get("/cost-centers", async (c) => {
  const tenant = c.get("tenant");
  return c.json({ data: await listCostCenters(c.get("db"), tenant.tenantId) });
});

// DRE gerencial por centro de custo. ?period=YYYY-MM filtra por vencimento.
dreRoutes.get("/", async (c) => {
  const tenant = c.get("tenant");
  const period = c.req.query("period");
  const dre = await getDre(c.get("db"), tenant.tenantId, period && /^\d{4}-\d{2}$/.test(period) ? period : undefined);
  return c.json({ data: dre });
});
