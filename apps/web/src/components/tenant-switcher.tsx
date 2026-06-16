"use client";

import { setApiContext } from "@/lib/api-client";

const TENANTS = [
  { id: "demo-tenant", name: "Demo Holding" },
  { id: "tenant_acme", name: "ACME Corp" },
] as const;

export function TenantSwitcher() {
  return (
    <div data-testid="tenant-switcher" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <label htmlFor="tenant" style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", fontWeight: 600 }}>
        Empresa
      </label>
      <select
        id="tenant"
        className="ina-input"
        style={{ width: "auto", minWidth: "180px", padding: "0.5rem 0.75rem" }}
        defaultValue="demo-tenant"
        onChange={(e) => setApiContext({ tenantId: e.target.value })}
      >
        {TENANTS.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
