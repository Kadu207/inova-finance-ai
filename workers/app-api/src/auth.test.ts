import { describe, it, expect } from "vitest";
import { hasPermission, requireMfaForRole } from "./rbac";
import { verifyTotp, generateTotpSecret } from "./mfa";

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

// Isolamento multitenant real é testado de ponta a ponta (via app.fetch)
// em ./routes/finance.test.ts, exercitando o cenário de header X-Tenant-Id
// forjado. O teste antigo aqui era tautológico e foi removido.
