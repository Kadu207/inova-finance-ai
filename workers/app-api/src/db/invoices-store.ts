import type { Prisma, PrismaClient } from "@inova/db";
import { withTenantScope } from "./client";
import { __memoryStoresForTests } from "./finance-store";
import type { NfseProvider } from "../integrations/nfse";

export type InvoiceView = {
  id: string;
  receivableId: string | null;
  serviceDescription: string;
  amount: string;
  customerName: string;
  status: string;
  number: string | null;
  pdfUrl: string | null;
  xmlUrl: string | null;
  providerId: string | null;
};

const invoicesMemory = new Map<string, InvoiceView & { tenantId: string }>();

type InvoiceRow = {
  id: string;
  receivableId: string | null;
  serviceDescription: string;
  amount: { toString(): string };
  customerName: string;
  status: string;
  number: string | null;
  pdfUrl: string | null;
  xmlUrl: string | null;
  providerId: string | null;
};

function view(row: InvoiceRow): InvoiceView {
  return {
    id: row.id,
    receivableId: row.receivableId,
    serviceDescription: row.serviceDescription,
    amount: row.amount.toString(),
    customerName: row.customerName,
    status: row.status,
    number: row.number,
    pdfUrl: row.pdfUrl,
    xmlUrl: row.xmlUrl,
    providerId: row.providerId,
  };
}

export type IssueInput = {
  receivableId?: string;
  serviceDescription: string;
  amount?: string;
  customerName?: string;
};

/**
 * Emite uma NFS-e via provedor (stub se NFSE_API_KEY ausente). Se receivableId for
 * informado, deriva valor/cliente do recebível. A chamada ao provedor roda FORA da
 * transação; a persistência com RLS. A referência tenantId:invoiceId vai ao provedor
 * para o webhook resolver o tenant.
 */
export async function issueInvoice(
  db: PrismaClient | null,
  tenantId: string,
  input: IssueInput,
  nfse: NfseProvider,
): Promise<InvoiceView | { error: string } | null> {
  let amount = input.amount;
  let customerName = input.customerName;

  if (input.receivableId) {
    if (db) {
      const r = await withTenantScope(db, tenantId, (tx) => tx.receivable.findFirst({ where: { id: input.receivableId, tenantId } }));
      if (!r) return null;
      amount = r.amount.toString();
      customerName = r.customerName;
    } else {
      const { receivables } = __memoryStoresForTests();
      const r = [...receivables.values()].find((x) => x.id === input.receivableId && x.tenantId === tenantId);
      if (!r) return null;
      amount = r.amount;
      customerName = r.customerName;
    }
  }

  if (!amount || !customerName) return { error: "amount e customerName são obrigatórios (ou informe um receivableId)" };

  const invoiceRef = crypto.randomUUID();
  const result = await nfse.issue({ amount, serviceDescription: input.serviceDescription, customerName, reference: `${tenantId}:${invoiceRef}` });

  if (db) {
    const row = await withTenantScope(db, tenantId, (tx) =>
      tx.invoice.create({
        data: {
          id: invoiceRef,
          tenantId,
          receivableId: input.receivableId ?? null,
          serviceDescription: input.serviceDescription,
          amount,
          customerName,
          provider: result.provider,
          providerId: result.providerId,
          number: result.number ?? null,
          status: result.status,
          pdfUrl: result.pdfUrl ?? null,
          xmlUrl: result.xmlUrl ?? null,
        } as Prisma.InvoiceUncheckedCreateInput,
      }),
    );
    return view(row);
  }

  const v: InvoiceView = {
    id: invoiceRef,
    receivableId: input.receivableId ?? null,
    serviceDescription: input.serviceDescription,
    amount,
    customerName,
    status: result.status,
    number: result.number ?? null,
    pdfUrl: result.pdfUrl ?? null,
    xmlUrl: result.xmlUrl ?? null,
    providerId: result.providerId,
  };
  invoicesMemory.set(invoiceRef, { ...v, tenantId });
  return v;
}

export async function listInvoices(db: PrismaClient | null, tenantId: string): Promise<InvoiceView[]> {
  if (db) {
    return withTenantScope(db, tenantId, async (tx) => {
      const rows = await tx.invoice.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
      return rows.map(view);
    });
  }
  return [...invoicesMemory.values()].filter((i) => i.tenantId === tenantId).map(({ tenantId: _t, ...v }) => v);
}

/** Webhook — atualiza status/número/URLs de uma NFS-e (emissão assíncrona). */
export async function updateInvoiceFromWebhook(
  db: PrismaClient | null,
  tenantId: string,
  providerId: string,
  patch: { status: string; number?: string; pdfUrl?: string; xmlUrl?: string },
): Promise<{ id: string } | null> {
  if (db) {
    return withTenantScope(db, tenantId, async (tx) => {
      const inv = await tx.invoice.findFirst({ where: { tenantId, providerId } });
      if (!inv) return null;
      await tx.invoice.update({
        where: { id: inv.id },
        data: { status: patch.status as Prisma.InvoiceUpdateInput["status"], number: patch.number ?? inv.number, pdfUrl: patch.pdfUrl ?? inv.pdfUrl, xmlUrl: patch.xmlUrl ?? inv.xmlUrl },
      });
      return { id: inv.id };
    });
  }
  const inv = [...invoicesMemory.values()].find((x) => x.tenantId === tenantId && x.providerId === providerId);
  if (!inv) return null;
  inv.status = patch.status;
  if (patch.number) inv.number = patch.number;
  if (patch.pdfUrl) inv.pdfUrl = patch.pdfUrl;
  if (patch.xmlUrl) inv.xmlUrl = patch.xmlUrl;
  return { id: inv.id };
}

/** @internal test hook */
export function __invoicesMemoryForTests() {
  return { invoicesMemory };
}
