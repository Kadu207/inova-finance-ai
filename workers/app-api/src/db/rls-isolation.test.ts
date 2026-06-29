import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createPrismaClient, type PrismaClient } from "@inova/db";
import { withTenantScope, probeRole } from "./client";
import { createPayable, listPayables } from "./finance-store";

/**
 * Teste de ISOLAMENTO real: prova que a Row-Level Security impede um tenant de ler dados
 * de outro, mesmo numa leitura direta por PK e mesmo sem filtro de aplicação.
 *
 * Requer Postgres real com o schema + RLS aplicados (pnpm db:push && pnpm db:rls) e a
 * conexão como a role inova_app (SEM BYPASSRLS). Configure RLS_TEST_DATABASE_URL apontando
 * para ela; sem isso o teste é PULADO (o CI não sobe Postgres):
 *   RLS_TEST_DATABASE_URL="postgresql://inova_app:inova_app_dev@127.0.0.1:5442/inova_finance"
 */
const url = process.env.RLS_TEST_DATABASE_URL;
const suffix = Math.random().toString(36).slice(2, 8);
const tenantA = `rls-a-${suffix}`;
const tenantB = `rls-b-${suffix}`;
const branchA = `br-a-${suffix}`;
const branchB = `br-b-${suffix}`;

describe.skipIf(!url)("RLS — isolamento entre tenants (Postgres real)", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = createPrismaClient(url!);
    // A RLS só vale se a role NÃO puder dar bypass — a mesma garantia da guarda de boot.
    const role = await probeRole(db);
    if (role.canBypass) {
      throw new Error(`RLS_TEST_DATABASE_URL conecta como "${role.role}" (superuser/BYPASSRLS). Use a role inova_app.`);
    }

    // Tenant e Branch ficam fora da RLS (tabelas de identidade) — criação direta.
    await db.tenant.create({ data: { id: tenantA, name: "RLS A", slug: tenantA } });
    await db.tenant.create({ data: { id: tenantB, name: "RLS B", slug: tenantB } });
    await db.branch.create({ data: { id: branchA, tenantId: tenantA, name: "Main", code: "main" } });
    await db.branch.create({ data: { id: branchB, tenantId: tenantB, name: "Main", code: "main" } });

    await createPayable(db, tenantA, { supplierName: `A-${suffix}`, amount: "10.00", dueDate: "2026-09-10", branchId: branchA, idempotencyKey: `a-${suffix}` });
    await createPayable(db, tenantB, { supplierName: `B-${suffix}`, amount: "20.00", dueDate: "2026-09-10", branchId: branchB, idempotencyKey: `b-${suffix}` });
  });

  afterAll(async () => {
    if (!db) return;
    // Delete em cascata (FK) remove Branch/Payable sem depender de scope.
    await db.tenant.delete({ where: { id: tenantA } }).catch(() => {});
    await db.tenant.delete({ where: { id: tenantB } }).catch(() => {});
    await db.$disconnect();
  });

  it("tenant A enxerga só os próprios títulos (não os de B)", async () => {
    const rows = await listPayables(db, tenantA);
    expect(rows.some((r) => r.supplierName === `A-${suffix}`)).toBe(true);
    expect(rows.some((r) => r.supplierName === `B-${suffix}`)).toBe(false);
  });

  it("ler um título de B com escopo de A retorna vazio (RLS filtra até por PK)", async () => {
    const bRows = await listPayables(db, tenantB);
    const bId = bRows.find((r) => r.supplierName === `B-${suffix}`)!.id;
    const found = await withTenantScope(db, tenantA, (tx) => tx.payable.findUnique({ where: { id: bId } }));
    expect(found).toBeNull();
  });

  it("sem escopo (app.tenant_id NULL) a RLS nega tudo (fail-closed)", async () => {
    const count = await db.payable.count();
    expect(count).toBe(0);
  });
});
