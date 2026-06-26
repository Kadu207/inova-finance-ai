import { describe, it, expect } from "vitest";
import app from "../app";
import type { Env } from "../types";
import { signJwt } from "../auth";
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

describe("Auth — gating do fallback de demo (C3)", () => {
  it("permite login demo em desenvolvimento", async () => {
    const res = await post("/auth/login", devEnv(), {}, { email: "admin@inova.local", password: "changeme" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { token?: string };
    expect(typeof json.token).toBe("string");
  });

  it("bloqueia o backdoor demo em produção (401, sem bootstrap de admin)", async () => {
    const res = await post("/auth/login", prodEnv(), {}, { email: "admin@inova.local", password: "changeme" });
    expect(res.status).toBe(401);
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
