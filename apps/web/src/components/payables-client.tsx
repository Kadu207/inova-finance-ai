"use client";

import { useState } from "react";
import { DataTable } from "@inova/ui";
import { PayableFormDrawer } from "./payable-form-drawer";

type Payable = {
  id: string;
  vendor: string;
  dueDate: string;
  amount: string;
  status: "open" | "paid" | "overdue";
};

const INITIAL: Payable[] = [
  { id: "1", vendor: "Fornecedor Alpha Ltda", dueDate: "18/06/2026", amount: "R$ 12.450,00", status: "open" },
  { id: "2", vendor: "Cloud Services BR", dueDate: "12/06/2026", amount: "R$ 3.890,00", status: "overdue" },
  { id: "3", vendor: "Logística Express", dueDate: "25/06/2026", amount: "R$ 8.200,00", status: "open" },
  { id: "4", vendor: "Consultoria Fiscal", dueDate: "05/06/2026", amount: "R$ 6.500,00", status: "paid" },
];

function StatusBadge({ status }: { status: Payable["status"] }) {
  const map = {
    open: { label: "Em aberto", className: "ina-badge--warning" },
    paid: { label: "Pago", className: "ina-badge--success" },
    overdue: { label: "Vencido", className: "ina-badge--danger" },
  } as const;
  const s = map[status];
  return <span className={`ina-badge ${s.className}`}>{s.label}</span>;
}

export function PayablesClient() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <div style={{ marginBottom: "1.5rem" }}>
        <button type="button" className="ina-btn ina-btn--primary" onClick={() => setDrawerOpen(true)}>
          + Novo lançamento
        </button>
      </div>

      <DataTable
        columns={[
          { key: "vendor", header: "Fornecedor", render: (r) => r.vendor },
          { key: "due", header: "Vencimento", render: (r) => r.dueDate },
          { key: "amount", header: "Valor", align: "right", render: (r) => <span className="ina-money">{r.amount}</span> },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rows={INITIAL}
      />

      <PayableFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
