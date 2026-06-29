import type { Prisma, PrismaClient } from "@inova/db";
import { withTenantScope } from "./client";
import { __memoryStoresForTests } from "./finance-store";
import type { PspProvider, ChargeMethod } from "../integrations/psp";

export type ChargeView = {
  id: string;
  receivableId: string;
  method: string;
  status: string;
  amount: string;
  boletoUrl: string | null;
  pixCode: string | null;
  providerId: string | null;
};

const chargesMemory = new Map<string, ChargeView & { tenantId: string }>();

type ChargeRow = {
  id: string;
  receivableId: string;
  method: string;
  status: string;
  amount: { toString(): string };
  boletoUrl: string | null;
  pixCode: string | null;
  providerId: string | null;
};

function view(row: ChargeRow): ChargeView {
  return {
    id: row.id,
    receivableId: row.receivableId,
    method: row.method,
    status: row.status,
    amount: row.amount.toString(),
    boletoUrl: row.boletoUrl,
    pixCode: row.pixCode,
    providerId: row.providerId,
  };
}

/**
 * Emite uma cobrança (boleto/PIX) para um recebível aberto via PSP. A chamada ao PSP
 * acontece FORA da transação; a persistência da cobrança roda com RLS. A referência
 * `tenantId:receivableId` viaja ao PSP para que o webhook resolva o tenant.
 */
export async function createCharge(
  db: PrismaClient | null,
  tenantId: string,
  input: { receivableId: string; method: ChargeMethod },
  psp: PspProvider,
): Promise<ChargeView | null> {
  if (db) {
    const r = await withTenantScope(db, tenantId, (tx) =>
      tx.receivable.findFirst({ where: { id: input.receivableId, tenantId, status: "open" } }),
    );
    if (!r) return null;
    const charge = await psp.createCharge({
      amount: r.amount.toString(),
      method: input.method,
      customerName: r.customerName,
      dueDate: r.dueDate.toISOString().slice(0, 10),
      reference: `${tenantId}:${r.id}`,
    });
    const row = await withTenantScope(db, tenantId, (tx) =>
      tx.charge.create({
        data: {
          tenantId,
          receivableId: r.id,
          method: input.method,
          provider: charge.provider,
          providerId: charge.providerId,
          amount: r.amount.toString(),
          boletoUrl: charge.boletoUrl ?? null,
          pixCode: charge.pixCode ?? null,
          status: "pending",
        } as Prisma.ChargeUncheckedCreateInput,
      }),
    );
    return view(row);
  }

  const { receivables } = __memoryStoresForTests();
  const r = [...receivables.values()].find((x) => x.id === input.receivableId && x.tenantId === tenantId && x.status === "open");
  if (!r) return null;
  const charge = await psp.createCharge({
    amount: r.amount,
    method: input.method,
    customerName: r.customerName,
    dueDate: r.dueDate,
    reference: `${tenantId}:${r.id}`,
  });
  const id = crypto.randomUUID();
  const v: ChargeView = {
    id,
    receivableId: r.id,
    method: input.method,
    status: "pending",
    amount: r.amount,
    boletoUrl: charge.boletoUrl ?? null,
    pixCode: charge.pixCode ?? null,
    providerId: charge.providerId,
  };
  chargesMemory.set(id, { ...v, tenantId });
  return v;
}

export async function listCharges(db: PrismaClient | null, tenantId: string): Promise<ChargeView[]> {
  if (db) {
    return withTenantScope(db, tenantId, async (tx) => {
      const rows = await tx.charge.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
      return rows.map(view);
    });
  }
  return [...chargesMemory.values()].filter((c) => c.tenantId === tenantId).map(({ tenantId: _t, ...v }) => v);
}

/** Baixa a cobrança (webhook de pagamento confirmado) e marca o recebível como pago. */
export async function markChargePaid(
  db: PrismaClient | null,
  tenantId: string,
  providerId: string,
): Promise<{ id: string; receivableId: string } | null> {
  if (db) {
    return withTenantScope(db, tenantId, async (tx) => {
      const c = await tx.charge.findFirst({ where: { tenantId, providerId, status: "pending" } });
      if (!c) return null;
      await tx.charge.update({ where: { id: c.id }, data: { status: "paid" } });
      await tx.receivable.updateMany({ where: { id: c.receivableId, tenantId }, data: { status: "paid" } });
      return { id: c.id, receivableId: c.receivableId };
    });
  }
  const c = [...chargesMemory.values()].find((x) => x.tenantId === tenantId && x.providerId === providerId && x.status === "pending");
  if (!c) return null;
  c.status = "paid";
  const { receivables } = __memoryStoresForTests();
  for (const x of receivables.values()) if (x.id === c.receivableId && x.tenantId === tenantId) x.status = "paid";
  return { id: c.id, receivableId: c.receivableId };
}

/** @internal test hook */
export function __chargesMemoryForTests() {
  return { chargesMemory };
}
