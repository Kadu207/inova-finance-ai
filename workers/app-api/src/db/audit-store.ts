import type { Prisma, PrismaClient } from "@inova/db";
import { withTenantScope } from "./client";
import { listPayables, listReceivables, __memoryStoresForTests } from "./finance-store";

export type AuditEntry = {
  tenantId: string;
  actorId?: string;
  action: string;
  resource: string;
  payload?: Record<string, unknown>;
};

/**
 * Grava uma entrada de auditoria. A tabela AuditLog é APPEND-ONLY (imutável):
 * a role da app (`inova_app`) tem apenas INSERT/SELECT — UPDATE/DELETE são
 * revogados em rls.sql. Em modo in-memory (sem banco) é no-op.
 */
export async function writeAuditLog(db: PrismaClient | null, entry: AuditEntry): Promise<void> {
  if (!db) return;
  await withTenantScope(db, entry.tenantId, async (tx) => {
    await tx.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorId: entry.actorId,
        action: entry.action,
        resource: entry.resource,
        payload: (entry.payload ?? {}) as Prisma.InputJsonValue,
      },
    });
  });
}

/** LGPD — exporta os dados do tenant (direito à portabilidade). */
export async function exportTenantData(db: PrismaClient | null, tenantId: string) {
  const payables = await listPayables(db, tenantId);
  const receivables = await listReceivables(db, tenantId);

  let auditLogs: Array<Record<string, unknown>> = [];
  if (db) {
    auditLogs = await withTenantScope(db, tenantId, async (tx) => {
      const rows = await tx.auditLog.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
      return rows.map((r) => ({
        id: r.id,
        action: r.action,
        resource: r.resource,
        actorId: r.actorId,
        payload: r.payload,
        createdAt: r.createdAt.toISOString(),
      }));
    });
  }

  return { tenantId, exportedAt: new Date().toISOString(), payables, receivables, auditLogs };
}

/**
 * LGPD — apaga os dados financeiros do tenant (direito ao esquecimento). O AuditLog
 * é PRESERVADO (imutável) e recebe uma entrada registrando o apagamento.
 */
export async function eraseTenantData(
  db: PrismaClient | null,
  tenantId: string,
  actorId?: string,
): Promise<{ payables: number; receivables: number; cashMovements: number; bankAccounts: number; agendaItems: number }> {
  if (db) {
    const counts = await withTenantScope(db, tenantId, async (tx) => {
      const cashMovements = await tx.cashMovement.deleteMany({ where: { tenantId } });
      const payables = await tx.payable.deleteMany({ where: { tenantId } });
      const receivables = await tx.receivable.deleteMany({ where: { tenantId } });
      const bankAccounts = await tx.bankAccount.deleteMany({ where: { tenantId } });
      const agendaItems = await tx.financeAgendaItem.deleteMany({ where: { tenantId } });
      return {
        payables: payables.count,
        receivables: receivables.count,
        cashMovements: cashMovements.count,
        bankAccounts: bankAccounts.count,
        agendaItems: agendaItems.count,
      };
    });
    await writeAuditLog(db, { tenantId, actorId, action: "lgpd.erase", resource: "tenant", payload: counts });
    return counts;
  }

  // in-memory: limpa os mapas do tenant
  const { payables, receivables } = __memoryStoresForTests();
  let p = 0;
  let r = 0;
  for (const k of [...payables.keys()]) {
    if (k.startsWith(`${tenantId}:`)) {
      payables.delete(k);
      p++;
    }
  }
  for (const k of [...receivables.keys()]) {
    if (k.startsWith(`${tenantId}:`)) {
      receivables.delete(k);
      r++;
    }
  }
  return { payables: p, receivables: r, cashMovements: 0, bankAccounts: 0, agendaItems: 0 };
}
