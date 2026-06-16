import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth.server";
import { DashboardShell } from "@/components/dashboard-shell";
import { DataTable } from "@inova/ui";

type Receivable = {
  id: string;
  customer: string;
  dueDate: string;
  amount: string;
  status: "open" | "received" | "overdue";
};

const MOCK_RECEIVABLES: Receivable[] = [
  { id: "1", customer: "Cliente Beta S.A.", dueDate: "20/06/2026", amount: "R$ 45.000,00", status: "open" },
  { id: "2", customer: "Distribuidora Gamma", dueDate: "10/06/2026", amount: "R$ 18.750,00", status: "overdue" },
  { id: "3", customer: "Tech Solutions", dueDate: "28/06/2026", amount: "R$ 9.300,00", status: "open" },
  { id: "4", customer: "Indústria Delta", dueDate: "01/06/2026", amount: "R$ 62.100,00", status: "received" },
];

function StatusBadge({ status }: { status: Receivable["status"] }) {
  const map = {
    open: { label: "Em aberto", className: "ina-badge--warning" },
    received: { label: "Recebido", className: "ina-badge--success" },
    overdue: { label: "Inadimplente", className: "ina-badge--danger" },
  } as const;
  const s = map[status];
  return <span className={`ina-badge ${s.className}`}>{s.label}</span>;
}

export default async function ReceivablesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardShell>
      <h1 className="ina-page-title">Contas a Receber</h1>
      <p className="ina-page-subtitle">Cobrança, promissórias e renegociação</p>

      <div style={{ marginBottom: "1.5rem" }}>
        <button type="button" className="ina-btn ina-btn--primary">
          + Novo título
        </button>
      </div>

      <DataTable
        columns={[
          { key: "customer", header: "Cliente", render: (r) => r.customer },
          { key: "due", header: "Vencimento", render: (r) => r.dueDate },
          {
            key: "amount",
            header: "Valor",
            align: "right",
            render: (r) => <span className="ina-money">{r.amount}</span>,
          },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rows={MOCK_RECEIVABLES}
      />
    </DashboardShell>
  );
}
