import type { PrismaClient } from "@inova/db";
import { serializePayable, serializeReceivable } from "./seed";

type PayableRecord = ReturnType<typeof serializePayable>;
type ReceivableRecord = ReturnType<typeof serializeReceivable>;

const payablesMemory = new Map<string, PayableRecord>();
const receivablesMemory = new Map<string, ReceivableRecord>();

function scopedKey(tenantId: string, id: string) {
  return `${tenantId}:${id}`;
}

export async function listPayables(db: PrismaClient | null, tenantId: string): Promise<PayableRecord[]> {
  if (db) {
    const rows = await db.payable.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
    return rows.map(serializePayable);
  }
  return [...payablesMemory.entries()]
    .filter(([k]) => k.startsWith(`${tenantId}:`))
    .map(([, v]) => v);
}

export async function createPayable(
  db: PrismaClient | null,
  tenantId: string,
  input: { supplierName: string; amount: string; dueDate: string; branchId: string; idempotencyKey: string },
): Promise<PayableRecord> {
  if (db) {
    const existing = await db.payable.findFirst({
      where: { tenantId, idempotencyKey: input.idempotencyKey },
    });
    if (existing) return serializePayable(existing);

    const row = await db.payable.create({
      data: {
        tenantId,
        branchId: input.branchId,
        supplierName: input.supplierName,
        amount: input.amount,
        dueDate: new Date(input.dueDate),
        idempotencyKey: input.idempotencyKey,
      },
    });
    return serializePayable(row);
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
    idempotencyKey: input.idempotencyKey,
    createdAt: new Date().toISOString(),
  };
  payablesMemory.set(scopedKey(tenantId, id), payable);
  return payable;
}

export async function listReceivables(db: PrismaClient | null, tenantId: string): Promise<ReceivableRecord[]> {
  if (db) {
    const rows = await db.receivable.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
    return rows.map(serializeReceivable);
  }
  return [...receivablesMemory.entries()]
    .filter(([k]) => k.startsWith(`${tenantId}:`))
    .map(([, v]) => v);
}

export async function createReceivable(
  db: PrismaClient | null,
  tenantId: string,
  input: { customerName: string; amount: string; dueDate: string; branchId: string; idempotencyKey: string },
): Promise<ReceivableRecord> {
  if (db) {
    const existing = await db.receivable.findFirst({
      where: { tenantId, idempotencyKey: input.idempotencyKey },
    });
    if (existing) return serializeReceivable(existing);

    const row = await db.receivable.create({
      data: {
        tenantId,
        branchId: input.branchId,
        customerName: input.customerName,
        amount: input.amount,
        dueDate: new Date(input.dueDate),
        idempotencyKey: input.idempotencyKey,
      },
    });
    return serializeReceivable(row);
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
    const [payables, receivables] = await Promise.all([
      db.payable.findMany({ where: { tenantId, status: "open" }, select: { amount: true } }),
      db.receivable.findMany({ where: { tenantId, status: "open" }, select: { amount: true } }),
    ]);
    const outflow = payables.reduce((s, p) => s + Number(p.amount), 0);
    const inflow = receivables.reduce((s, r) => s + Number(r.amount), 0);
    return { inflow, outflow, net: inflow - outflow };
  }

  const payables = [...payablesMemory.values()].filter((p) => p.tenantId === tenantId && p.status === "open");
  const receivables = [...receivablesMemory.values()].filter((r) => r.tenantId === tenantId && r.status === "open");
  const outflow = payables.reduce((s, p) => s + parseFloat(p.amount), 0);
  const inflow = receivables.reduce((s, r) => s + parseFloat(r.amount), 0);
  return { inflow, outflow, net: inflow - outflow };
}

export async function getAgenda(db: PrismaClient | null, tenantId: string) {
  if (db) {
    const [payables, receivables] = await Promise.all([
      db.payable.findMany({ where: { tenantId }, select: { id: true, supplierName: true, dueDate: true } }),
      db.receivable.findMany({ where: { tenantId }, select: { id: true, customerName: true, dueDate: true } }),
    ]);
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
