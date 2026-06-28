import type { Prisma, PrismaClient } from "@inova/db";
import { withTenantScope } from "./client";
import { __memoryStoresForTests } from "./finance-store";

export type ParsedTxn = {
  fitid: string;
  amount: string; // valor absoluto, 2 casas
  date: string; // YYYY-MM-DD
  type: "debit" | "credit";
  description: string;
};

export type ImportResult = {
  sessionId: string;
  bankAccountId: string;
  total: number;
  matched: number;
  unmatched: number;
};

const MATCH_WINDOW_DAYS = 5;

/** Parser OFX mínimo: extrai os lançamentos (STMTTRN) do extrato. */
export function parseOfx(ofx: string): ParsedTxn[] {
  const out: ParsedTxn[] = [];
  const blocks = ofx.split(/<STMTTRN>/i).slice(1);
  for (const block of blocks) {
    const get = (tag: string): string => {
      const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
      return m?.[1]?.trim() ?? "";
    };
    const fitid = get("FITID");
    const trnamt = get("TRNAMT");
    const dtposted = get("DTPOSTED");
    if (!fitid || !trnamt || dtposted.length < 8) continue;
    const amountNum = parseFloat(trnamt);
    if (Number.isNaN(amountNum)) continue;
    out.push({
      fitid,
      amount: Math.abs(amountNum).toFixed(2),
      date: `${dtposted.slice(0, 4)}-${dtposted.slice(4, 6)}-${dtposted.slice(6, 8)}`,
      type: amountNum < 0 ? "debit" : "credit",
      description: get("NAME") || get("MEMO") || "—",
    });
  }
  return out;
}

function withinWindow(dueDate: string, postedDate: string): boolean {
  const a = new Date(`${dueDate.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${postedDate.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.abs(a - b) <= MATCH_WINDOW_DAYS * 86_400_000;
}

// ---- in-memory (dev/test sem banco) ----
type MemTxn = { id: string; tenantId: string; fitid: string; status: "unmatched" | "matched" } & ParsedTxn;
const txnsMemory = new Map<string, MemTxn>();
const sessionsMemory = new Map<string, ImportResult & { tenantId: string; createdAt: string }>();

async function importDb(
  db: PrismaClient,
  tenantId: string,
  input: { bankAccountId: string; fileName?: string; correlationId: string; txns: ParsedTxn[] },
): Promise<ImportResult> {
  return withTenantScope(db, tenantId, async (tx) => {
    let matched = 0;
    for (const t of input.txns) {
      const existing = await tx.bankTransaction.findUnique({
        where: { tenantId_fitid: { tenantId, fitid: t.fitid } },
      });
      if (existing) continue; // idempotente por FITID

      const bt = await tx.bankTransaction.create({
        data: {
          tenantId,
          bankAccountId: input.bankAccountId,
          fitid: t.fitid,
          amount: t.amount,
          type: t.type,
          postedAt: new Date(`${t.date}T00:00:00Z`),
          description: t.description,
          status: "unmatched",
        },
      });

      const start = new Date(new Date(`${t.date}T00:00:00Z`).getTime() - MATCH_WINDOW_DAYS * 86_400_000);
      const end = new Date(new Date(`${t.date}T00:00:00Z`).getTime() + MATCH_WINDOW_DAYS * 86_400_000);

      if (t.type === "debit") {
        const p = await tx.payable.findFirst({
          where: { tenantId, status: "open", amount: t.amount, dueDate: { gte: start, lte: end } },
        });
        if (p) {
          await tx.payable.update({ where: { id: p.id }, data: { status: "paid" } });
          await tx.bankTransaction.update({ where: { id: bt.id }, data: { status: "matched" } });
          await tx.reconciliationMatch.create({
            data: { tenantId, bankTransactionId: bt.id, resourceType: "payable", resourceId: p.id, origin: "auto", status: "confirmed" } as Prisma.ReconciliationMatchUncheckedCreateInput,
          });
          matched++;
        }
      } else {
        const r = await tx.receivable.findFirst({
          where: { tenantId, status: "open", amount: t.amount, dueDate: { gte: start, lte: end } },
        });
        if (r) {
          await tx.receivable.update({ where: { id: r.id }, data: { status: "paid" } });
          await tx.bankTransaction.update({ where: { id: bt.id }, data: { status: "matched" } });
          await tx.reconciliationMatch.create({
            data: { tenantId, bankTransactionId: bt.id, resourceType: "receivable", resourceId: r.id, origin: "auto", status: "confirmed" } as Prisma.ReconciliationMatchUncheckedCreateInput,
          });
          matched++;
        }
      }
    }

    const total = input.txns.length;
    const session = await tx.reconciliationSession.create({
      data: {
        tenantId,
        bankAccountId: input.bankAccountId,
        fileName: input.fileName,
        total,
        matched,
        unmatched: total - matched,
        correlationId: input.correlationId,
      },
    });
    return { sessionId: session.id, bankAccountId: input.bankAccountId, total, matched, unmatched: total - matched };
  });
}

function importMemory(
  tenantId: string,
  input: { bankAccountId: string; fileName?: string; txns: ParsedTxn[] },
): ImportResult {
  const { payables, receivables } = __memoryStoresForTests();
  let matched = 0;
  for (const t of input.txns) {
    const key = `${tenantId}:${t.fitid}`;
    if (txnsMemory.has(key)) continue; // idempotente
    let status: "unmatched" | "matched" = "unmatched";
    const pool = t.type === "debit" ? payables : receivables;
    const found = [...pool.values()].find(
      (x) =>
        x.tenantId === tenantId &&
        x.status === "open" &&
        parseFloat(x.amount) === parseFloat(t.amount) &&
        withinWindow(x.dueDate, t.date),
    );
    if (found) {
      found.status = "paid";
      status = "matched";
      matched++;
    }
    txnsMemory.set(key, { id: crypto.randomUUID(), tenantId, status, ...t });
  }
  const total = input.txns.length;
  const sessionId = crypto.randomUUID();
  const result: ImportResult = { sessionId, bankAccountId: input.bankAccountId, total, matched, unmatched: total - matched };
  sessionsMemory.set(sessionId, { ...result, tenantId, createdAt: new Date().toISOString() });
  return result;
}

/** Importa um extrato OFX e concilia automaticamente (US1). */
export async function importStatement(
  db: PrismaClient | null,
  tenantId: string,
  input: { bankAccountId: string; ofx: string; fileName?: string; correlationId: string },
): Promise<ImportResult> {
  const txns = parseOfx(input.ofx);
  if (db) {
    return importDb(db, tenantId, { ...input, txns });
  }
  return importMemory(tenantId, { bankAccountId: input.bankAccountId, fileName: input.fileName, txns });
}

/** Lista os lançamentos bancários do tenant (para revisão — base da US2). */
export async function listBankTransactions(db: PrismaClient | null, tenantId: string) {
  if (db) {
    return withTenantScope(db, tenantId, async (tx) => {
      const rows = await tx.bankTransaction.findMany({ where: { tenantId }, orderBy: { postedAt: "desc" } });
      return rows.map((r) => ({
        id: r.id,
        fitid: r.fitid,
        amount: r.amount.toString(),
        type: r.type,
        postedAt: r.postedAt.toISOString().slice(0, 10),
        description: r.description,
        status: r.status,
      }));
    });
  }
  return [...txnsMemory.values()]
    .filter((t) => t.tenantId === tenantId)
    .map((t) => ({ id: t.id, fitid: t.fitid, amount: t.amount, type: t.type, postedAt: t.date, description: t.description, status: t.status }));
}

/** @internal test hook */
export function __reconciliationMemoryForTests() {
  return { txnsMemory, sessionsMemory };
}
