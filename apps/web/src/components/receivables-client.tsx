"use client";

import { useCallback, useEffect, useState } from "react";
import { DataTable } from "@inova/ui";
import {
  createReceivable,
  fetchReceivables,
  formatBRL,
  formatDateBR,
  receivableStatusUi,
  type ApiReceivable,
} from "@/lib/finance-api";

type ReceivableRow = {
  id: string;
  customer: string;
  dueDate: string;
  amount: string;
  status: "open" | "paid" | "overdue";
};

function StatusBadge({ status }: { status: ReceivableRow["status"] }) {
  const map = {
    open: { label: "Em aberto", className: "ina-badge--warning" },
    paid: { label: "Recebido", className: "ina-badge--success" },
    overdue: { label: "Inadimplente", className: "ina-badge--danger" },
  } as const;
  const s = map[status];
  return <span className={`ina-badge ${s.className}`}>{s.label}</span>;
}

function toRow(r: ApiReceivable): ReceivableRow {
  return {
    id: r.id,
    customer: r.customerName,
    dueDate: formatDateBR(r.dueDate),
    amount: formatBRL(r.amount),
    status: receivableStatusUi(r.status, r.dueDate),
  };
}

export function ReceivablesClient() {
  const [rows, setRows] = useState<ReceivableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [customer, setCustomer] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchReceivables();
      setRows(data.map(toRow));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar contas a receber");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (!customer || !amount || !dueDate) return;
    setSubmitting(true);
    try {
      await createReceivable({
        customerName: customer,
        amount,
        dueDate,
        branchId: "branch_main",
      });
      setFormOpen(false);
      setCustomer("");
      setAmount("");
      setDueDate("");
      setLoading(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar título");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div style={{ marginBottom: "1.5rem" }}>
        <button type="button" className="ina-btn ina-btn--primary" onClick={() => setFormOpen(true)}>
          + Novo título
        </button>
      </div>

      {error && (
        <p className="ina-badge ina-badge--danger" style={{ marginBottom: "1rem", display: "inline-block" }}>
          {error}
        </p>
      )}

      {formOpen && (
        <div className="ina-card" style={{ marginBottom: "1.5rem" }}>
          <div className="ina-card__body" style={{ display: "grid", gap: "0.75rem", maxWidth: 480 }}>
            <input className="ina-input" placeholder="Cliente *" value={customer} onChange={(e) => setCustomer(e.target.value)} />
            <input className="ina-input" type="number" step="0.01" placeholder="Valor *" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <input className="ina-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" className="ina-btn ina-btn--primary" disabled={submitting} onClick={() => void handleCreate()}>
                {submitting ? "Salvando..." : "Salvar"}
              </button>
              <button type="button" className="ina-btn ina-btn--ghost" onClick={() => setFormOpen(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--color-text-muted)" }}>Carregando...</p>
      ) : (
        <DataTable
          columns={[
            { key: "customer", header: "Cliente", render: (r) => r.customer },
            { key: "due", header: "Vencimento", render: (r) => r.dueDate },
            { key: "amount", header: "Valor", align: "right", render: (r) => <span className="ina-money">{r.amount}</span> },
            { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          ]}
          rows={rows}
        />
      )}
    </>
  );
}
