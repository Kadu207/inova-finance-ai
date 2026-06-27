import { Hono } from "hono";
import type { Env, TenantContext, AuthUser } from "../types";
import { verifyJwt } from "../auth";
import { hasPermission } from "../rbac";
import { getDb, resolveConnectionString } from "../db/client";
import { exportTenantData, eraseTenantData } from "../db/audit-store";

type LgpdVars = { tenant: TenantContext; user: AuthUser };

export const lgpdRoutes = new Hono<{ Bindings: Env; Variables: LgpdVars }>();

// Exige JWT + papel administrativo. O tenant é derivado do JWT (C1), nunca do header.
lgpdRoutes.use("*", async (c, next) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  const user = await verifyJwt(token, c.env.JWT_SECRET);
  if (!user) return c.json({ error: "Invalid token" }, 401);
  if (!hasPermission(user.role, "tenant:admin")) return c.json({ error: "Forbidden" }, 403);

  const headerTenant = c.get("tenant");
  c.set("tenant", { ...headerTenant, tenantId: user.tenantId, userId: user.userId });
  c.set("user", user);
  await next();
});

// LGPD — portabilidade: exporta os dados do tenant.
lgpdRoutes.get("/export", async (c) => {
  const tenant = c.get("tenant");
  const db = await getDb(resolveConnectionString(c.env));
  const data = await exportTenantData(db, tenant.tenantId);
  return c.json({ data });
});

// LGPD — esquecimento: apaga os dados financeiros do tenant (AuditLog é preservado).
lgpdRoutes.post("/erase", async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const db = await getDb(resolveConnectionString(c.env));
  const erased = await eraseTenantData(db, tenant.tenantId, user.userId);
  return c.json({ data: { erased } });
});
