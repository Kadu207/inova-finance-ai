import type { Prisma, PrismaClient } from "@inova/db";
import { withTenantScope } from "./client";
import { __memoryStoresForTests } from "./finance-store";

export type CostCenterView = { id: string; name: string; code: string; active: boolean };

const ccMemory = new Map<string, CostCenterView & { tenantId: string }>();

function isUnique(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}
function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function createCostCenter(
  db: PrismaClient | null,
  tenantId: string,
  input: { name: string; code: string },
): Promise<CostCenterView | { error: string }> {
  if (db) {
    try {
      const row = await withTenantScope(db, tenantId, (tx) =>
        tx.costCenter.create({ data: { tenantId, name: input.name, code: input.code } as Prisma.CostCenterUncheckedCreateInput }),
      );
      return { id: row.id, name: row.name, code: row.code, active: row.active };
    } catch (e) {
      if (isUnique(e)) return { error: "Código de centro de custo já existe" };
      throw e;
    }
  }
  if ([...ccMemory.values()].some((c) => c.tenantId === tenantId && c.code === input.code)) {
    return { error: "Código de centro de custo já existe" };
  }
  const id = crypto.randomUUID();
  const v: CostCenterView = { id, name: input.name, code: input.code, active: true };
  ccMemory.set(id, { ...v, tenantId });
  return v;
}

export async function listCostCenters(db: PrismaClient | null, tenantId: string): Promise<CostCenterView[]> {
  if (db) {
    return withTenantScope(db, tenantId, async (tx) => {
      const rows = await tx.costCenter.findMany({ where: { tenantId }, orderBy: { code: "asc" } });
      return rows.map((c) => ({ id: c.id, name: c.name, code: c.code, active: c.active }));
    });
  }
  return [...ccMemory.values()].filter((c) => c.tenantId === tenantId).map(({ tenantId: _t, ...v }) => v);
}

export type DreRow = { costCenterId: string | null; costCenterName: string; revenue: number; expense: number; net: number };
export type Dre = { period: string | null; byCostCenter: DreRow[]; total: { revenue: number; expense: number; net: number } };

function dueDateRange(period: string): { gte: Date; lt: Date } {
  const [y, m] = period.split("-").map(Number);
  return { gte: new Date(Date.UTC(y!, m! - 1, 1)), lt: new Date(Date.UTC(y!, m!, 1)) };
}

/**
 * DRE gerencial agrupada por centro de custo: receitas (recebíveis) − despesas
 * (pagáveis), por período (YYYY-MM, por dueDate) ou geral. Sem centro de custo é
 * agregado em "Sem centro de custo".
 */
export async function getDre(db: PrismaClient | null, tenantId: string, period?: string): Promise<Dre> {
  const ccs = await listCostCenters(db, tenantId);
  const nameOf = (id: string | null) => (id ? (ccs.find((c) => c.id === id)?.name ?? "(removido)") : "Sem centro de custo");

  const acc = new Map<string | null, { revenue: number; expense: number }>();
  const add = (id: string | null, key: "revenue" | "expense", v: number) => {
    const cur = acc.get(id) ?? { revenue: 0, expense: 0 };
    cur[key] += v;
    acc.set(id, cur);
  };

  if (db) {
    await withTenantScope(db, tenantId, async (tx) => {
      const where = period ? { dueDate: dueDateRange(period) } : {};
      const pays = await tx.payable.findMany({ where: { tenantId, ...where }, select: { amount: true, costCenterId: true } });
      const recs = await tx.receivable.findMany({ where: { tenantId, ...where }, select: { amount: true, costCenterId: true } });
      for (const p of pays) add(p.costCenterId, "expense", Number(p.amount));
      for (const r of recs) add(r.costCenterId, "revenue", Number(r.amount));
    });
  } else {
    const { payables, receivables } = __memoryStoresForTests();
    const inPeriod = (d: string) => !period || d.slice(0, 7) === period;
    for (const p of payables.values()) if (p.tenantId === tenantId && inPeriod(p.dueDate)) add(p.costCenterId ?? null, "expense", parseFloat(p.amount));
    for (const r of receivables.values()) if (r.tenantId === tenantId && inPeriod(r.dueDate)) add(r.costCenterId ?? null, "revenue", parseFloat(r.amount));
  }

  const byCostCenter: DreRow[] = [...acc.entries()].map(([id, v]) => ({
    costCenterId: id,
    costCenterName: nameOf(id),
    revenue: roundMoney(v.revenue),
    expense: roundMoney(v.expense),
    net: roundMoney(v.revenue - v.expense),
  }));
  const sum = byCostCenter.reduce(
    (t, r) => ({ revenue: t.revenue + r.revenue, expense: t.expense + r.expense, net: t.net + r.net }),
    { revenue: 0, expense: 0, net: 0 },
  );
  return {
    period: period ?? null,
    byCostCenter,
    total: { revenue: roundMoney(sum.revenue), expense: roundMoney(sum.expense), net: roundMoney(sum.net) },
  };
}

/** @internal test hook */
export function __costCentersMemoryForTests() {
  return { ccMemory };
}
