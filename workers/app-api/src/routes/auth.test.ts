import { describe, it, expect } from "vitest";
import app from "../app";
import type { Env } from "../types";
import { signJwt, hashPassword } from "../auth";
import { generateTotp } from "../mfa";
import { createLocalEnv } from "../local-env";

function devEnv(): Env {
  return createLocalEnv();
}

function prodEnv(): Env {
  return { ...createLocalEnv(), ENVIRONMENT: "production" };
}

function post(path: string, env: Env, headers: Record<string, string>, body?: unknown): Promise<Response> {
  return Promise.resolve(
    app.fetch(
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: body ? JSON.stringify(body) : undefined,
      }),
      env,
    ),
  );
}

function get(path: string, env: Env, headers: Record<string, string>): Promise<Response> {
  return Promise.resolve(
    app.fetch(
      new Request(`http://localhost${path}`, { method: "GET", headers: { "X-Tenant-Id": "demo-tenant", "X-Correlation-Id": "t", ...headers } }),
      env,
    ),
  );
}

describe("Auth — gating do fallback de demo (C3)", () => {
  it("admin demo sem MFA recebe enrolamento obrigatório (não uma sessão)", async () => {
    const res = await post("/auth/login", devEnv(), {}, { email: "admin@inova.local", password: "changeme" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { token?: string; mfaEnrollmentRequired?: boolean; enrollmentToken?: string };
    expect(json.token).toBeUndefined();
    expect(json.mfaEnrollmentRequired).toBe(true);
    expect(typeof json.enrollmentToken).toBe("string");
  });

  it("bloqueia o backdoor demo em produção (401, sem bootstrap de admin)", async () => {
    const res = await post("/auth/login", prodEnv(), {}, { email: "admin@inova.local", password: "changeme" });
    expect(res.status).toBe(401);
  });
});

describe("Auth — MFA obrigatório para admin/owner", () => {
  it("token de enrolamento NÃO acessa rota protegida (escopo restrito)", async () => {
    const env = devEnv();
    const login = (await (await post("/auth/login", env, {}, { email: "admin@inova.local", password: "changeme" })).json()) as {
      enrollmentToken: string;
    };
    const res = await get("/api/finance/payables", env, { Authorization: `Bearer ${login.enrollmentToken}` });
    expect(res.status).toBe(401);
  });

  it("fluxo completo: enrola via token de enrolamento e depois loga com TOTP (sessão plena)", async () => {
    const env = devEnv();
    const login = (await (await post("/auth/login", env, {}, { email: "admin@inova.local", password: "changeme" })).json()) as {
      enrollmentToken: string;
    };

    // setup + verify usando o token de enrolamento
    const setup = (await (await post("/auth/mfa/setup", env, { Authorization: `Bearer ${login.enrollmentToken}` }, {})).json()) as {
      secret: string;
    };
    const verify = await post(
      "/auth/mfa/verify",
      env,
      { Authorization: `Bearer ${login.enrollmentToken}` },
      { totp: await generateTotp(setup.secret) },
    );
    expect(verify.status).toBe(200);

    // agora o login exige e aceita o TOTP, devolvendo sessão plena
    const sansTotp = await post("/auth/login", env, {}, { email: "admin@inova.local", password: "changeme" });
    expect(((await sansTotp.json()) as { mfaRequired?: boolean }).mfaRequired).toBe(true);

    const withTotp = (await (await post(
      "/auth/login",
      env,
      {},
      { email: "admin@inova.local", password: "changeme", totp: await generateTotp(setup.secret) },
    )).json()) as { token?: string };
    expect(typeof withTotp.token).toBe("string");
  });
});

describe("Auth — endpoints MFA exigem JWT (C4)", () => {
  it("nega /mfa/setup sem token", async () => {
    const res = await post("/auth/mfa/setup", devEnv(), {}, { email: "victim@a.test" });
    expect(res.status).toBe(401);
  });

  it("nega /mfa/verify sem token", async () => {
    const res = await post("/auth/mfa/verify", devEnv(), {}, { totp: "000000" });
    expect(res.status).toBe(401);
  });

  it("permite /mfa/setup com token válido e usa o e-mail do token (não do body)", async () => {
    const env = devEnv();
    const token = await signJwt(
      { userId: "u1", email: "user@a.test", tenantId: "demo-tenant", role: "admin", branchIds: [] },
      env.JWT_SECRET,
    );
    const res = await post(
      "/auth/mfa/setup",
      env,
      { Authorization: `Bearer ${token}` },
      { email: "victim@a.test" },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { secret?: string; uri?: string };
    expect(json.secret).toBeTruthy();
    expect(json.uri).toContain("user%40a.test");
    expect(json.uri).not.toContain("victim");
  });
});

describe("Auth — refresh token e revogação", () => {
  // Semeia um usuário de role "finance" no KV (sem MFA) para obter sessão plena no login dev.
  async function seedFinanceUser(env: Env): Promise<void> {
    const passwordHash = await hashPassword("senha123");
    await env.SESSIONS.put(
      "user:fin@a.test",
      JSON.stringify({ userId: "u-fin", email: "fin@a.test", passwordHash, role: "finance", mfaEnabled: false, branchIds: ["branch_main"] }),
    );
  }

  it("login emite access + refresh; refresh rotaciona e revoga o anterior; logout revoga", async () => {
    const env = devEnv();
    await seedFinanceUser(env);

    const login = (await (await post("/auth/login", env, {}, { email: "fin@a.test", password: "senha123" })).json()) as {
      token: string;
      refreshToken: string;
    };
    expect(typeof login.token).toBe("string");
    expect(typeof login.refreshToken).toBe("string");

    // /refresh → novo par; o refresh anterior deixa de valer (uso único)
    const r1 = await post("/auth/refresh", env, {}, { refreshToken: login.refreshToken });
    expect(r1.status).toBe(200);
    const refreshed = (await r1.json()) as { token: string; refreshToken: string };
    expect(typeof refreshed.token).toBe("string");
    expect(refreshed.refreshToken).not.toBe(login.refreshToken);

    const reuseOld = await post("/auth/refresh", env, {}, { refreshToken: login.refreshToken });
    expect(reuseOld.status).toBe(401);

    // logout revoga o refresh atual
    const logout = await post("/auth/logout", env, {}, { refreshToken: refreshed.refreshToken });
    expect(logout.status).toBe(200);
    const afterLogout = await post("/auth/refresh", env, {}, { refreshToken: refreshed.refreshToken });
    expect(afterLogout.status).toBe(401);
  });

  it("refresh sem token → 400; refresh inválido → 401", async () => {
    const env = devEnv();
    expect((await post("/auth/refresh", env, {}, {})).status).toBe(400);
    expect((await post("/auth/refresh", env, {}, { refreshToken: "inexistente" })).status).toBe(401);
  });
});
