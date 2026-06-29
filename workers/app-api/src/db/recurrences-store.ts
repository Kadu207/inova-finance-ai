import type { Prisma, PrismaClient } from "@inova/db";
import { withTenantScope } from "./client";
import { createPayable, createReceivable } from "./finance-store";

export type RecurrenceView = {
  id: string;
  type: "payable" | "receivable";
  name: string;
  amount: string;
  dayOfMonth: number;
  branchId: string;
  costCenterId: string | null;
  active: boolean;
};

const recMemory = new Map<string, RecurrenceView & { tenantId: string }>();

type RecRow = {
  id: string;
  type: string;
  name: string;
  amount: { toString(): string };
  dayOfMonth: number;
  branchId: string;
  costCenterId: string | null;
  active: boolean;
};

function view(row: RecRow): RecurrenceView {
  return {
    id: row.id,
    type: row.type as "payable" | "receivable",
    name: row.name,
    amount: row.amount.toString(),
    dayOfMonth: row.dayOfMonth,
    branchId: row.branchId,
    costCenterId: row.costCenterId,
    active: row.active,
  };
}

export type RecurrenceInput = {
  type: "payable" | "receivable";
  name: string;
  amount: string;
  dayOfMonth: number;
  branchId: string;
  costCenterId?: string | null;
};

export async function createRecurrence(db: PrismaClient | null, tenantId: string, input: RecurrenceInput): Promise<RecurrenceView> {
  if (db) {
    const row = await withTenantScope(db, tenantId, (tx) =>
      tx.recurrence.create({
        data: {
          tenantId,
          type: input.type,
          name: input.name,
          amount: input.amount,
          dayOfMonth: input.dayOfMonth,
          branchId: input.branchId,
          costCenterId: input.costCenterId ?? null,
        } as Prisma.RecurrenceUncheckedCreateInput,
      }),
    );
    return view(row);
  }
  const id = crypto.randomUUID();
  const v: RecurrenceView = {
    id,
    type: input.type,
    name: input.name,
    amount: input.amount,
    dayOfMonth: input.dayOfMonth,
    branchId: input.branchId,
    costCenterId: input.costCenterId ?? null,
    active: true,
  };
  recMemory.set(id, { ...v, tenantId });
  return v;
}

export async function listRecurrences(db: PrismaClient | null, tenantId: string): Promise<RecurrenceView[]> {
  if (db) {
    return withTenantScope(db, tenantId, async (tx) => {
      const rows = await tx.recurrence.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
      return rows.map(view);
    });
  }
  return [...recMemory.values()].filter((r) => r.tenantId === tenantId).map(({ tenantId: _t, ...v }) => v);
}

/** Vencimento do mês para o dia da recorrência (limitado ao último dia do mês). */
function dueDateFor(month: string, day: number): string {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const d = Math.min(Math.max(1, day), lastDay);
  return `${month}-${String(d).padStart(2, "0")}`;
}

/**
 * Gera os títulos das recorrências ativas para o mês (YYYY-MM). Idempotente: usa
 * idempotencyKey `recur:<id>:<mês>`, então reexecutar não duplica.
 */
export async function runRecurrences(db: PrismaClient | null, tenantId: string, month: string): Promise<{ processed: number }> {
  const recs = (await listRecurrences(db, tenantId)).filter((r) => r.active);
  for (const r of recs) {
    const dueDate = dueDateFor(month, r.dayOfMonth);
    const idempotencyKey = `recur:${r.id}:${month}`;
    if (r.type === "payable") {
      await createPayable(db, tenantId, { supplierName: r.name, amount: r.amount, dueDate, branchId: r.branchId, costCenterId: r.costCenterId, idempotencyKey });
    } else {
      await createReceivable(db, tenantId, { customerName: r.name, amount: r.amount, dueDate, branchId: r.branchId, costCenterId: r.costCenterId, idempotencyKey });
    }
  }
  return { processed: recs.length };
}

/**
 * Lista os IDs de todos os tenants. Tenant NÃO é RLS-protegido (tabela de identidade),
 * então a consulta é direta, sem `withTenantScope`. Em memória, deriva dos recMemory.
 */
async function listAllTenantIds(db: PrismaClient | null): Promise<string[]> {
  if (db) {
    const rows = await db.tenant.findMany({ select: { id: true } });
    return rows.map((r) => r.id);
  }
  return [...new Set([...recMemory.values()].map((r) => r.tenantId))];
}

/**
 * Roda as recorrências do mês para TODOS os tenants (usado pelo cron mensal). Idempotente
 * por tenant. Falha de um tenant não interrompe os demais (é registrada e seguimos).
 */
export async function runRecurrencesAllTenants(
  db: PrismaClient | null,
  month: string,
): Promise<{ tenants: number; processed: number; failed: number }> {
  const tenantIds = await listAllTenantIds(db);
  let processed = 0;
  let failed = 0;
  for (const tenantId of tenantIds) {
    try {
      const r = await runRecurrences(db, tenantId, month);
      processed += r.processed;
    } catch (err) {
      failed++;
      console.error(JSON.stringify({ level: "error", event: "recurrence.cron.tenant_failed", tenantId, month, message: (err as Error).message }));
    }
  }
  return { tenants: tenantIds.length, processed, failed };
}

/** @internal test hook */
export function __recurrencesMemoryForTests() {
  return { recMemory };
}
