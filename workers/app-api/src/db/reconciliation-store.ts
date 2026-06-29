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
type MemMatch = {
  id: string;
  tenantId: string;
  bankTransactionId: string;
  resourceType: "payable" | "receivable";
  resourceId: string;
  origin: "auto" | "ai" | "manual";
  status: "suggested" | "confirmed" | "rejected";
};
const txnsMemory = new Map<string, MemTxn>();
const matchesMemory = new Map<string, MemMatch>();
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
    const txnId = crypto.randomUUID();
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
      const matchId = crypto.randomUUID();
      matchesMemory.set(matchId, {
        id: matchId,
        tenantId,
        bankTransactionId: txnId,
        resourceType: t.type === "debit" ? "payable" : "receivable",
        resourceId: found.id,
        origin: "auto",
        status: "confirmed",
      });
    }
    txnsMemory.set(key, { id: txnId, tenantId, status, ...t });
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

function activeMatchView(m: MemMatch | { id: string; status: string; origin: string; resourceType: string; resourceId: string }) {
  return { id: m.id, status: m.status, origin: m.origin, resourceType: m.resourceType, resourceId: m.resourceId };
}

/** Lista os lançamentos bancários do tenant, com o match ativo (não-rejeitado) — base da revisão (US2). */
export async function listBankTransactions(db: PrismaClient | null, tenantId: string) {
  if (db) {
    return withTenantScope(db, tenantId, async (tx) => {
      const rows = await tx.bankTransaction.findMany({ where: { tenantId }, orderBy: { postedAt: "desc" }, include: { matches: true } });
      return rows.map((r) => {
        const active = r.matches.find((m) => m.status !== "rejected");
        return {
          id: r.id,
          fitid: r.fitid,
          amount: r.amount.toString(),
          type: r.type,
          postedAt: r.postedAt.toISOString().slice(0, 10),
          description: r.description,
          status: r.status,
          match: active ? activeMatchView(active) : null,
        };
      });
    });
  }
  return [...txnsMemory.values()]
    .filter((t) => t.tenantId === tenantId)
    .map((t) => {
      const active = [...matchesMemory.values()].find((m) => m.bankTransactionId === t.id && m.status !== "rejected");
      return { id: t.id, fitid: t.fitid, amount: t.amount, type: t.type, postedAt: t.date, description: t.description, status: t.status, match: active ? activeMatchView(active) : null };
    });
}

// US2 — confirmar um match sugerido (baixa o título).
export async function confirmMatch(db: PrismaClient | null, tenantId: string, matchId: string): Promise<{ id: string; status: string } | null> {
  if (db) {
    return withTenantScope(db, tenantId, async (tx) => {
      const m = await tx.reconciliationMatch.findFirst({ where: { id: matchId, tenantId } });
      if (!m) return null;
      if (m.status === "suggested") {
        if (m.resourceType === "payable") await tx.payable.updateMany({ where: { id: m.resourceId, tenantId }, data: { status: "paid" } });
        else if (m.resourceType === "receivable") await tx.receivable.updateMany({ where: { id: m.resourceId, tenantId }, data: { status: "paid" } });
        await tx.bankTransaction.update({ where: { id: m.bankTransactionId }, data: { status: "matched" } });
        await tx.reconciliationMatch.update({ where: { id: m.id }, data: { status: "confirmed" } });
      }
      return { id: m.id, status: "confirmed" };
    });
  }
  const m = matchesMemory.get(matchId);
  if (!m || m.tenantId !== tenantId) return null;
  if (m.status === "suggested") {
    const { payables, receivables } = __memoryStoresForTests();
    const pool = m.resourceType === "payable" ? payables : receivables;
    for (const x of pool.values()) if (x.id === m.resourceId) x.status = "paid";
    for (const t of txnsMemory.values()) if (t.id === m.bankTransactionId) t.status = "matched";
    m.status = "confirmed";
  }
  return { id: m.id, status: "confirmed" };
}

// US2 — rejeitar/desfazer um match (estorna o título para "open", lançamento volta a "unmatched").
export async function rejectMatch(db: PrismaClient | null, tenantId: string, matchId: string): Promise<{ id: string; status: string } | null> {
  if (db) {
    return withTenantScope(db, tenantId, async (tx) => {
      const m = await tx.reconciliationMatch.findFirst({ where: { id: matchId, tenantId } });
      if (!m || m.status === "rejected") return null;
      if (m.resourceType === "payable") await tx.payable.updateMany({ where: { id: m.resourceId, tenantId }, data: { status: "open" } });
      else if (m.resourceType === "receivable") await tx.receivable.updateMany({ where: { id: m.resourceId, tenantId }, data: { status: "open" } });
      await tx.bankTransaction.update({ where: { id: m.bankTransactionId }, data: { status: "unmatched" } });
      await tx.reconciliationMatch.update({ where: { id: m.id }, data: { status: "rejected" } });
      return { id: m.id, status: "rejected" };
    });
  }
  const m = matchesMemory.get(matchId);
  if (!m || m.tenantId !== tenantId || m.status === "rejected") return null;
  const { payables, receivables } = __memoryStoresForTests();
  const pool = m.resourceType === "payable" ? payables : receivables;
  for (const x of pool.values()) if (x.id === m.resourceId && x.tenantId === tenantId) x.status = "open";
  for (const t of txnsMemory.values()) if (t.id === m.bankTransactionId) t.status = "unmatched";
  m.status = "rejected";
  return { id: m.id, status: "rejected" };
}

// US2 — casar manualmente um lançamento não conciliado com um título aberto.
export async function createManualMatch(
  db: PrismaClient | null,
  tenantId: string,
  input: { bankTransactionId: string; resourceType: "payable" | "receivable"; resourceId: string },
): Promise<{ id: string } | null> {
  if (db) {
    return withTenantScope(db, tenantId, async (tx) => {
      const bt = await tx.bankTransaction.findFirst({ where: { id: input.bankTransactionId, tenantId } });
      if (!bt) return null;
      if (input.resourceType === "payable") {
        const p = await tx.payable.findFirst({ where: { id: input.resourceId, tenantId, status: "open" } });
        if (!p) return null;
        await tx.payable.update({ where: { id: p.id }, data: { status: "paid" } });
      } else {
        const r = await tx.receivable.findFirst({ where: { id: input.resourceId, tenantId, status: "open" } });
        if (!r) return null;
        await tx.receivable.update({ where: { id: r.id }, data: { status: "paid" } });
      }
      await tx.bankTransaction.update({ where: { id: bt.id }, data: { status: "matched" } });
      const m = await tx.reconciliationMatch.create({
        data: { tenantId, bankTransactionId: bt.id, resourceType: input.resourceType, resourceId: input.resourceId, origin: "manual", status: "confirmed" } as Prisma.ReconciliationMatchUncheckedCreateInput,
      });
      return { id: m.id };
    });
  }
  const bt = [...txnsMemory.values()].find((t) => t.id === input.bankTransactionId && t.tenantId === tenantId);
  if (!bt) return null;
  const { payables, receivables } = __memoryStoresForTests();
  const pool = input.resourceType === "payable" ? payables : receivables;
  const res = [...pool.values()].find((x) => x.id === input.resourceId && x.tenantId === tenantId && x.status === "open");
  if (!res) return null;
  res.status = "paid";
  bt.status = "matched";
  const id = crypto.randomUUID();
  matchesMemory.set(id, { id, tenantId, bankTransactionId: bt.id, resourceType: input.resourceType, resourceId: input.resourceId, origin: "manual", status: "confirmed" });
  return { id };
}

/** @internal test hook */
export function __reconciliationMemoryForTests() {
  return { txnsMemory, matchesMemory, sessionsMemory };
}
