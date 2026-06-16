"use client";

import { useEffect, useState } from "react";
import { StatCard } from "@inova/ui";
import Link from "next/link";
import { CashFlowChart } from "@/components/cash-flow-chart";
import { getClientSession } from "@/lib/auth.client";
import { fetchAgenda, fetchCashFlow, formatBRL, formatDateBR } from "@/lib/finance-api";

type DueRow = { vendor: string; amount: string; status: string };

export function DashboardClient() {
  const [cashFlow, setCashFlow] = useState({ inflow: 0, outflow: 0, net: 0 });
  const [dueWeek, setDueWeek] = useState<DueRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getClientSession();
    if (!token) {
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const [cf, agenda] = await Promise.all([fetchCashFlow(token), fetchAgenda(token)]);
        setCashFlow(cf);
        const payables = agenda
          .filter((a) => a.type === "payable")
          .slice(0, 5)
          .map((a) => {
            const due = new Date(a.dueDate.slice(0, 10));
            const overdue = due < new Date(new Date().toDateString());
            return {
              vendor: a.title,
              amount: "—",
              status: overdue ? "Vencido" : formatDateBR(a.dueDate),
            };
          });
        setDueWeek(payables);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <>
      <div className="ina-grid-stats">
        <StatCard
          label="Saldo líquido (AR - AP aberto)"
          value={loading ? "..." : formatBRL(cashFlow.net)}
          delta={loading ? "" : `Entradas ${formatBRL(cashFlow.inflow)} · Saídas ${formatBRL(cashFlow.outflow)}`}
          accent="var(--ina-emerald)"
        />
        <StatCard
          label="A receber (aberto)"
          value={loading ? "..." : formatBRL(cashFlow.inflow)}
          delta="Títulos AR em aberto"
          accent="var(--ina-corporate-light)"
        />
        <StatCard
          label="A pagar (aberto)"
          value={loading ? "..." : formatBRL(cashFlow.outflow)}
          delta="Títulos AP em aberto"
          accent="var(--ina-gold)"
        />
        <StatCard label="Inadimplência" value="—" delta="BI fase posterior" accent="var(--ina-coral)" />
      </div>

      <div className="ina-card" style={{ marginBottom: "1.5rem" }}>
        <div className="ina-card__header">
          <strong>Fluxo de caixa — 12 meses</strong>
        </div>
        <div className="ina-card__body">
          <CashFlowChart />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div className="ina-card">
          <div className="ina-card__header">
            <strong>Agenda financeira (AP)</strong>
          </div>
          <div className="ina-card__body" style={{ padding: 0 }}>
            {loading ? (
              <p style={{ padding: "1rem" }}>Carregando...</p>
            ) : dueWeek.length === 0 ? (
              <p style={{ padding: "1rem", color: "var(--color-text-muted)" }}>Nenhum vencimento registrado.</p>
            ) : (
              <table className="ina-table">
                <tbody>
                  {dueWeek.map((row) => (
                    <tr key={row.vendor}>
                      <td>{row.vendor}</td>
                      <td className="ina-money" style={{ textAlign: "right" }}>{row.amount}</td>
                      <td style={{ textAlign: "right" }}>
                        <span className={`ina-badge ${row.status === "Vencido" ? "ina-badge--danger" : "ina-badge--warning"}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="ina-card">
          <div className="ina-card__header">
            <strong>Ações rápidas</strong>
          </div>
          <div className="ina-card__body" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <Link href="/payables" className="ina-btn ina-btn--ghost" style={{ justifyContent: "flex-start" }}>
              Lançar conta a pagar
            </Link>
            <Link href="/receivables" className="ina-btn ina-btn--ghost" style={{ justifyContent: "flex-start" }}>
              Registrar recebimento
            </Link>
            <Link href="/support" className="ina-btn ina-btn--ghost" style={{ justifyContent: "flex-start" }}>
              Atendimento Chatwoot
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
