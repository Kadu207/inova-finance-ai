import { Hono } from "hono";
import type { Env } from "../types";
import { signJwt, verifyJwt, verifyPassword, hashPassword } from "../auth";
import { generateTotpSecret, buildTotpUri, verifyTotp } from "../mfa";
import { requireMfaForRole } from "../rbac";
import { enableMfaForUser, verifyDbCredentials } from "../db/auth-store";
import { getDb, resolveConnectionString } from "../db/client";
import { DEMO_ADMIN_EMAIL } from "../db/seed";
import { issueRefreshToken, consumeRefreshToken, revokeRefreshToken } from "../refresh-tokens";

// Access token mantido em 1h para não regredir a UX atual (o frontend ainda não consome
// /refresh). Com o refresh (7 dias) + revogação no lugar, encurtar para ~15 min é um passo
// seguro quando o frontend adotar o /refresh.
const ACCESS_TOKEN_TTL_SEC = 60 * 60;

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

  const sessionUser = {
    userId: userRecord.userId,
    email: userRecord.email,
    tenantId: userRecord.tenantId,
    role: userRecord.role,
    branchIds: userRecord.branchIds,
  };
  const token = await signJwt(sessionUser, c.env.JWT_SECRET, ACCESS_TOKEN_TTL_SEC);
  const refreshToken = await issueRefreshToken(c.env.SESSIONS, sessionUser);

  return c.json({ token, refreshToken, role: userRecord.role });
});

// Troca um refresh token válido por um novo access token + novo refresh (rotação). O
// refresh é de uso único: o anterior é invalidado, barrando replay.
authRoutes.post("/refresh", async (c) => {
  const { refreshToken } = await c.req.json<{ refreshToken?: string }>().catch(() => ({}) as { refreshToken?: string });
  if (!refreshToken) return c.json({ error: "refreshToken obrigatório" }, 400);

  const rec = await consumeRefreshToken(c.env.SESSIONS, refreshToken);
  if (!rec) return c.json({ error: "Refresh token inválido ou expirado" }, 401);

  const sessionUser = {
    userId: rec.userId,
    email: rec.email,
    tenantId: rec.tenantId,
    role: rec.role,
    branchIds: rec.branchIds,
  };
  const token = await signJwt(sessionUser, c.env.JWT_SECRET, ACCESS_TOKEN_TTL_SEC);
  const newRefreshToken = await issueRefreshToken(c.env.SESSIONS, sessionUser);

  return c.json({ token, refreshToken: newRefreshToken, role: rec.role });
});

// Logout: revoga o refresh token apresentado (a sessão deixa de renovar). Idempotente.
authRoutes.post("/logout", async (c) => {
  const { refreshToken } = await c.req.json<{ refreshToken?: string }>().catch(() => ({}) as { refreshToken?: string });
  if (refreshToken) await revokeRefreshToken(c.env.SESSIONS, refreshToken);
  return c.json({ ok: true });
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
