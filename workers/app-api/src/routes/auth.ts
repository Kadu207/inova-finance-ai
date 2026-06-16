import { Hono } from "hono";
import type { Env } from "../types";
import { signJwt, verifyPassword, hashPassword } from "../auth";
import { generateTotpSecret, buildTotpUri, verifyTotp } from "../mfa";
import { requireMfaForRole } from "../rbac";
import { enableMfaForUser, verifyDbCredentials } from "../db/auth-store";
import { DEMO_ADMIN_EMAIL } from "../db/seed";

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.post("/login", async (c) => {
  const body = await c.req.json<{ email: string; password: string; totp?: string }>();
  const tenantId = c.req.header("X-Tenant-Id") ?? "demo-tenant";

  let userRecord = await verifyDbCredentials(body.email, body.password, tenantId);

  if (!userRecord) {
    const demoKey = `user:${body.email}`;
    let kvRecord = (await c.env.SESSIONS.get(demoKey, "json")) as {
      userId: string;
      email: string;
      passwordHash: string;
      role: string;
      mfaSecret?: string;
      mfaEnabled: boolean;
      branchIds: string[];
    } | null;

    if (!kvRecord && body.email === DEMO_ADMIN_EMAIL && body.password === "changeme") {
      kvRecord = {
        userId: "user_demo_admin",
        email: body.email,
        passwordHash: await hashPassword(body.password),
        role: "admin",
        mfaEnabled: false,
        branchIds: ["branch_main"],
      };
      await c.env.SESSIONS.put(demoKey, JSON.stringify(kvRecord));
    }

    if (!kvRecord || !(await verifyPassword(body.password, kvRecord.passwordHash))) {
      return c.json({ error: "Credenciais inválidas" }, 401);
    }

    userRecord = { ...kvRecord, tenantId };
  }

  if (requireMfaForRole(userRecord.role) && userRecord.mfaEnabled) {
    if (!body.totp || !userRecord.mfaSecret || !(await verifyTotp(userRecord.mfaSecret, body.totp))) {
      return c.json({ error: "MFA obrigatório", mfaRequired: true }, 401);
    }
  }

  const token = await signJwt(
    {
      userId: userRecord.userId,
      email: userRecord.email,
      tenantId: userRecord.tenantId,
      role: userRecord.role,
      branchIds: userRecord.branchIds,
    },
    c.env.JWT_SECRET,
  );

  return c.json({ token, role: userRecord.role });
});

authRoutes.post("/mfa/setup", async (c) => {
  const auth = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json<{ email: string }>();
  const secret = generateTotpSecret();
  const uri = buildTotpUri(secret, body.email);

  await c.env.SESSIONS.put(`mfa-pending:${body.email}`, secret, { expirationTtl: 600 });

  return c.json({ secret, uri });
});

authRoutes.post("/mfa/verify", async (c) => {
  const body = await c.req.json<{ email: string; totp: string }>();
  const pending = await c.env.SESSIONS.get(`mfa-pending:${body.email}`);
  if (!pending) return c.json({ error: "Setup expirado" }, 400);

  const valid = await verifyTotp(pending, body.totp);
  if (!valid) return c.json({ error: "Código inválido" }, 400);

  const enabledInDb = await enableMfaForUser(body.email, pending);
  if (!enabledInDb) {
    const demoKey = `user:${body.email}`;
    const userRecord = (await c.env.SESSIONS.get(demoKey, "json")) as Record<string, unknown> | null;
    if (userRecord) {
      await c.env.SESSIONS.put(
        demoKey,
        JSON.stringify({ ...userRecord, mfaSecret: pending, mfaEnabled: true }),
      );
    }
  }

  await c.env.SESSIONS.delete(`mfa-pending:${body.email}`);
  return c.json({ mfaEnabled: true });
});
