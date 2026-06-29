import { Hono } from "hono";
import type { Env } from "../types";
import { signJwt, verifyJwt, verifyPassword, hashPassword } from "../auth";
import { generateTotpSecret, buildTotpUri, verifyTotp } from "../mfa";
import { requireMfaForRole } from "../rbac";
import { enableMfaForUser, verifyDbCredentials } from "../db/auth-store";
import { getDb, resolveConnectionString } from "../db/client";
import { DEMO_ADMIN_EMAIL } from "../db/seed";

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.post("/login", async (c) => {
  const body = await c.req.json<{ email: string; password: string; totp?: string }>();
  const tenantId = c.req.header("X-Tenant-Id") ?? "demo-tenant";

  const db = await getDb(resolveConnectionString(c.env));
  let userRecord = await verifyDbCredentials(db, body.email, body.password, tenantId);

  // C3 — O fallback de demo em KV (incl. bootstrap do admin com senha fixa)
  // NUNCA roda em produção: lá a autenticação depende exclusivamente do banco.
  if (!userRecord && c.env.ENVIRONMENT !== "production") {
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

  if (!userRecord) {
    return c.json({ error: "Credenciais inválidas" }, 401);
  }

  const mfaRequired = requireMfaForRole(userRecord.role);

  // Admin/owner com MFA habilitado: exige o código TOTP no login.
  if (mfaRequired && userRecord.mfaEnabled) {
    if (!body.totp || !userRecord.mfaSecret || !(await verifyTotp(userRecord.mfaSecret, body.totp))) {
      return c.json({ error: "MFA obrigatório", mfaRequired: true }, 401);
    }
  }

  // MFA é OBRIGATÓRIO para admin/owner. Se ainda não habilitou, ele não recebe sessão:
  // emitimos um token de ENROLAMENTO de escopo restrito (10 min) que só é aceito por
  // /auth/mfa/setup e /auth/mfa/verify. Sem habilitar o MFA, não há acesso a rota protegida.
  if (mfaRequired && !userRecord.mfaEnabled) {
    const enrollmentToken = await signJwt(
      {
        userId: userRecord.userId,
        email: userRecord.email,
        tenantId: userRecord.tenantId,
        role: userRecord.role,
        branchIds: userRecord.branchIds,
      },
      c.env.JWT_SECRET,
      600,
      "mfa-enrollment",
    );
    return c.json({ mfaEnrollmentRequired: true, enrollmentToken, role: userRecord.role });
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
  // C4 — exige JWT válido; o e-mail vem do token, nunca do body (impede
  // configurar MFA para a conta de terceiros).
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  const user = token ? await verifyJwt(token, c.env.JWT_SECRET, { allowEnrollment: true }) : null;
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const secret = generateTotpSecret();
  const uri = buildTotpUri(secret, user.email);

  await c.env.SESSIONS.put(`mfa-pending:${user.email}`, secret, { expirationTtl: 600 });

  return c.json({ secret, uri });
});

authRoutes.post("/mfa/verify", async (c) => {
  // C4 — exige JWT válido; o e-mail vem do token, nunca do body.
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  const user = token ? await verifyJwt(token, c.env.JWT_SECRET, { allowEnrollment: true }) : null;
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json<{ totp: string }>();
  const pending = await c.env.SESSIONS.get(`mfa-pending:${user.email}`);
  if (!pending) return c.json({ error: "Setup expirado" }, 400);

  const valid = await verifyTotp(pending, body.totp);
  if (!valid) return c.json({ error: "Código inválido" }, 400);

  const db = await getDb(resolveConnectionString(c.env));
  const enabledInDb = await enableMfaForUser(db, user.email, pending);
  if (!enabledInDb) {
    const demoKey = `user:${user.email}`;
    const userRecord = (await c.env.SESSIONS.get(demoKey, "json")) as Record<string, unknown> | null;
    if (userRecord) {
      await c.env.SESSIONS.put(
        demoKey,
        JSON.stringify({ ...userRecord, mfaSecret: pending, mfaEnabled: true }),
      );
    }
  }

  await c.env.SESSIONS.delete(`mfa-pending:${user.email}`);
  return c.json({ mfaEnabled: true });
});
