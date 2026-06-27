import { describe, it, expect } from "vitest";
import { hasPermission, requireMfaForRole } from "./rbac";
import { verifyTotp, generateTotpSecret } from "./mfa";
import { signJwt, verifyJwt, timingSafeEqual } from "./auth";

describe("RBAC", () => {
  it("allows finance write for admin", () => {
    expect(hasPermission("admin", "finance:write")).toBe(true);
  });

  it("denies finance write for viewer", () => {
    expect(hasPermission("viewer", "finance:write")).toBe(false);
  });

  it("requires MFA for admin role", () => {
    expect(requireMfaForRole("admin")).toBe(true);
    expect(requireMfaForRole("viewer")).toBe(false);
  });
});

describe("MFA TOTP", () => {
  it("generates valid secret", () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBeGreaterThan(10);
  });
});

describe("JWT (B5 — base64url + validação de alg)", () => {
  const secret = "test-secret-min-32-characters-long-aaaa";
  const user = { userId: "u1", email: "a@b.c", tenantId: "t1", role: "admin", branchIds: ["b1"] };

  it("emite token base64url (sem +, / ou =) e faz round-trip", async () => {
    const token = await signJwt(user, secret);
    expect(token).not.toMatch(/[+/=]/);
    const decoded = await verifyJwt(token, secret);
    expect(decoded?.tenantId).toBe("t1");
    expect(decoded?.email).toBe("a@b.c");
  });

  it("rejeita token assinado com secret diferente", async () => {
    const token = await signJwt(user, secret);
    expect(await verifyJwt(token, "outro-secret-min-32-characters-long-xx")).toBeNull();
  });

  it("rejeita header com alg != HS256 (defesa contra alg confusion)", async () => {
    const token = await signJwt(user, secret);
    const [, payload, sig] = token.split(".");
    const noneHeader = btoa(JSON.stringify({ alg: "none", typ: "JWT" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await verifyJwt(`${noneHeader}.${payload}.${sig}`, secret)).toBeNull();
  });

  it("rejeita token expirado", async () => {
    const token = await signJwt(user, secret, -10);
    expect(await verifyJwt(token, secret)).toBeNull();
  });
});

describe("timingSafeEqual (B6)", () => {
  it("compara em tempo constante mantendo a corretude", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

// Isolamento multitenant real é testado de ponta a ponta (via app.fetch)
// em ./routes/finance.test.ts, exercitando o cenário de header X-Tenant-Id
// forjado. O teste antigo aqui era tautológico e foi removido.
