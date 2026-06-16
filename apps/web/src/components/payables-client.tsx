"use client";

import { useCallback, useEffect, useState } from "react";
import { DataTable } from "@inova/ui";
import { PayableFormDrawer } from "./payable-form-drawer";
import { getClientSession } from "@/lib/auth.client";
import {
  fetchPayables,
  formatBRL,
  formatDateBR,
  payableStatusUi,
  type ApiPayable,
} from "@/lib/finance-api";

type PayableRow = {
  id: string;
  vendor: string;
  dueDate: string;
  amount: string;
  status: "open" | "paid" | "overdue";
};

function StatusBadge({ status }: { status: PayableRow["status"] }) {
  const map = {
    open: { label: "Em aberto", className: "ina-badge--warning" },
    paid: { label: "Pago", className: "ina-badge--success" },
    overdue: { label: "Vencido", className: "ina-badge--danger" },
  } as const;
  const s = map[status];
  return <span className={`ina-badge ${s.className}`}>{s.label}</span>;
}

function toRow(p: ApiPayable): PayableRow {
  return {
    id: p.id,
    vendor: p.supplierName,
    dueDate: formatDateBR(p.dueDate),
    amount: formatBRL(p.amount),
    status: payableStatusUi(p.status, p.dueDate),
  };
}

export function PayablesClient() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rows, setRows] = useState<PayableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getClientSession();
    if (!token) {
      setError("Sessão expirada. Faça login novamente.");
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const data = await fetchPayables(token);
      setRows(data.map(toRow));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar contas a pagar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div style={{ marginBottom: "1.5rem" }}>
        <button type="button" className="ina-btn ina-btn--primary" onClick={() => setDrawerOpen(true)}>
          + Novo lançamento
        </button>
      </div>

      {error && (
        <p className="ina-badge ina-badge--danger" style={{ marginBottom: "1rem", display: "inline-block" }}>
          {error}
        </p>
      )}

      {loading ? (
        <p style={{ color: "var(--color-text-muted)" }}>Carregando...</p>
      ) : (
        <DataTable
          columns={[
            { key: "vendor", header: "Fornecedor", render: (r) => r.vendor },
            { key: "due", header: "Vencimento", render: (r) => r.dueDate },
            { key: "amount", header: "Valor", align: "right", render: (r) => <span className="ina-money">{r.amount}</span> },
            { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          ]}
          rows={rows}
        />
      )}

      <PayableFormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onCreated={() => {
          setLoading(true);
          void load();
        }}
      />
    </>
  );
}
