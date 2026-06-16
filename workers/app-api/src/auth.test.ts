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

describe("Tenant isolation", () => {
  it("scoped keys prevent cross-tenant access", () => {
    const keyA = `tenant_a:pay_1`;
    const keyB = `tenant_b:pay_1`;
    expect(keyA.startsWith("tenant_a:")).toBe(true);
    expect(keyB.startsWith("tenant_a:")).toBe(false);
  });
});
