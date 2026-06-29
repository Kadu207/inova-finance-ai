import type { PrismaClient } from "@inova/db";
import { withTenantScope } from "./client";
import { serializePayable, serializeReceivable } from "./seed";

type PayableRecord = ReturnType<typeof serializePayable>;
type ReceivableRecord = ReturnType<typeof serializeReceivable>;

const payablesMemory = new Map<string, PayableRecord>();
const receivablesMemory = new Map<string, ReceivableRecord>();

function scopedKey(tenantId: string, id: string) {
  return `${tenantId}:${id}`;
}

/** Detecta violação de unique constraint do Prisma (P2002) — usado na idempotência (B4). */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

/** Arredonda para centavos, evitando artefato de ponto flutuante na resposta (B2). */
function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

// Toda query de banco roda via withTenantScope: a RLS no Postgres garante o
// isolamento por tenant no nível do banco (defense-in-depth do C1), além do
// filtro de aplicação `where: { tenantId }`.

export async function listPayables(db: PrismaClient | null, tenantId: string): Promise<PayableRecord[]> {
  if (db) {
    return withTenantScope(db, tenantId, async (tx) => {
      const rows = await tx.payable.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
      return rows.map(serializePayable);
    });
  }
  return [...payablesMemory.entries()]
    .filter(([k]) => k.startsWith(`${tenantId}:`))
    .map(([, v]) => v);
}

export async function createPayable(
  db: PrismaClient | null,
  tenantId: string,
  input: { supplierName: string; amount: string; dueDate: string; branchId: string; idempotencyKey: string; costCenterId?: string | null },
): Promise<PayableRecord> {
  if (db) {
    try {
      return await withTenantScope(db, tenantId, async (tx) => {
        const existing = await tx.payable.findFirst({ where: { tenantId, idempotencyKey: input.idempotencyKey } });
        if (existing) return serializePayable(existing);
        const row = await tx.payable.create({
          data: {
            tenantId,
            branchId: input.branchId,
            supplierName: input.supplierName,
            amount: input.amount,
            dueDate: new Date(input.dueDate),
            costCenterId: input.costCenterId ?? null,
            idempotencyKey: input.idempotencyKey,
          },
        });
        return serializePayable(row);
      });
    } catch (error) {
      // B4 — corrida: requisição concorrente com a mesma idempotencyKey já inseriu.
      if (isUniqueViolation(error)) {
        return withTenantScope(db, tenantId, async (tx) => {
          const row = await tx.payable.findFirst({ where: { tenantId, idempotencyKey: input.idempotencyKey } });
          if (row) return serializePayable(row);
          throw error;
        });
      }
      throw error;
    }
  }

  const existingMem = [...payablesMemory.values()].find(
    (p) => p.tenantId === tenantId && p.idempotencyKey === input.idempotencyKey,
  );
  if (existingMem) return existingMem;

  const id = crypto.randomUUID();
  const payable: PayableRecord = {
    id,
    tenantId,
    branchId: input.branchId,
    supplierName: input.supplierName,
    amount: input.amount,
    dueDate: input.dueDate,
    status: "open",
    costCenterId: input.costCenterId ?? null,
    idempotencyKey: input.idempotencyKey,
    createdAt: new Date().toISOString(),
  };
  payablesMemory.set(scopedKey(tenantId, id), payable);
  return payable;
}

export async function listReceivables(db: PrismaClient | null, tenantId: string): Promise<ReceivableRecord[]> {
  if (db) {
    return withTenantScope(db, tenantId, async (tx) => {
      const rows = await tx.receivable.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
      return rows.map(serializeReceivable);
    });
  }
  return [...receivablesMemory.entries()]
    .filter(([k]) => k.startsWith(`${tenantId}:`))
    .map(([, v]) => v);
}

export async function createReceivable(
  db: PrismaClient | null,
  tenantId: string,
  input: { customerName: string; amount: string; dueDate: string; branchId: string; idempotencyKey: string; costCenterId?: string | null },
): Promise<ReceivableRecord> {
  if (db) {
    try {
      return await withTenantScope(db, tenantId, async (tx) => {
        const existing = await tx.receivable.findFirst({ where: { tenantId, idempotencyKey: input.idempotencyKey } });
        if (existing) return serializeReceivable(existing);
        const row = await tx.receivable.create({
          data: {
            tenantId,
            branchId: input.branchId,
            customerName: input.customerName,
            amount: input.amount,
            dueDate: new Date(input.dueDate),
            costCenterId: input.costCenterId ?? null,
            idempotencyKey: input.idempotencyKey,
          },
        });
        return serializeReceivable(row);
      });
    } catch (error) {
      // B4 — corrida: requisição concorrente com a mesma idempotencyKey já inseriu.
      if (isUniqueViolation(error)) {
        return withTenantScope(db, tenantId, async (tx) => {
          const row = await tx.receivable.findFirst({ where: { tenantId, idempotencyKey: input.idempotencyKey } });
          if (row) return serializeReceivable(row);
          throw error;
        });
      }
      throw error;
    }
  }

  const id = crypto.randomUUID();
  const receivable: ReceivableRecord = {
    id,
    tenantId,
    branchId: input.branchId,
    customerName: input.customerName,
    amount: input.amount,
    dueDate: input.dueDate,
    status: "open",
    costCenterId: input.costCenterId ?? null,
    idempotencyKey: input.idempotencyKey,
    createdAt: new Date().toISOString(),
  };
  receivablesMemory.set(scopedKey(tenantId, id), receivable);
  return receivable;
}

export async function getCashFlow(
  db: PrismaClient | null,
  tenantId: string,
): Promise<{ inflow: number; outflow: number; net: number }> {
  if (db) {
    return withTenantScope(db, tenantId, async (tx) => {
      // B2 — soma feita no banco em Decimal (exato); converte para number uma única
      // vez, evitando acúmulo de erro de ponto flutuante sobre muitos registros.
      const payAgg = await tx.payable.aggregate({ _sum: { amount: true }, where: { tenantId, status: "open" } });
      const recAgg = await tx.receivable.aggregate({ _sum: { amount: true }, where: { tenantId, status: "open" } });
      const outflow = Number(payAgg._sum.amount ?? 0);
      const inflow = Number(recAgg._sum.amount ?? 0);
      return { inflow: roundMoney(inflow), outflow: roundMoney(outflow), net: roundMoney(inflow - outflow) };
    });
  }

  const payables = [...payablesMemory.values()].filter((p) => p.tenantId === tenantId && p.status === "open");
  const receivables = [...receivablesMemory.values()].filter((r) => r.tenantId === tenantId && r.status === "open");
  const outflow = payables.reduce((s, p) => s + parseFloat(p.amount), 0);
  const inflow = receivables.reduce((s, r) => s + parseFloat(r.amount), 0);
  return { inflow: roundMoney(inflow), outflow: roundMoney(outflow), net: roundMoney(inflow - outflow) };
}

export async function getAgenda(db: PrismaClient | null, tenantId: string) {
  if (db) {
    return withTenantScope(db, tenantId, async (tx) => {
      const payables = await tx.payable.findMany({ where: { tenantId }, select: { id: true, supplierName: true, dueDate: true } });
      const receivables = await tx.receivable.findMany({ where: { tenantId }, select: { id: true, customerName: true, dueDate: true } });
      return [
        ...payables.map((p) => ({
          type: "payable" as const,
          id: p.id,
          title: p.supplierName,
          dueDate: p.dueDate.toISOString().slice(0, 10),
        })),
        ...receivables.map((r) => ({
          type: "receivable" as const,
          id: r.id,
          title: r.customerName,
          dueDate: r.dueDate.toISOString().slice(0, 10),
        })),
      ];
    });
  }

  return [
    ...[...payablesMemory.values()]
      .filter((p) => p.tenantId === tenantId)
      .map((p) => ({ type: "payable" as const, id: p.id, title: p.supplierName, dueDate: p.dueDate })),
    ...[...receivablesMemory.values()]
      .filter((r) => r.tenantId === tenantId)
      .map((r) => ({ type: "receivable" as const, id: r.id, title: r.customerName, dueDate: r.dueDate })),
  ];
}

/** @internal test hook */
export function __memoryStoresForTests(): { payables: Map<string, PayableRecord>; receivables: Map<string, ReceivableRecord> } {
  return { payables: payablesMemory, receivables: receivablesMemory };
}

export type { PrismaClient };
