"use client";

import { StatCard } from "@inova/ui";
import Link from "next/link";
import { CashFlowChart } from "@/components/cash-flow-chart";

const DUE_THIS_WEEK = [
  { vendor: "Cloud Services BR", amount: "R$ 3.890,00", status: "Vencido" },
  { vendor: "Fornecedor Alpha", amount: "R$ 12.450,00", status: "18/06" },
  { vendor: "Logística Express", amount: "R$ 8.200,00", status: "25/06" },
];

export function DashboardClient() {
  return (
    <>
      <div className="ina-grid-stats">
        <StatCard label="Saldo em caixa" value="R$ 284.520,00" delta="+12,4% vs mês anterior" accent="var(--ina-emerald)" />
        <StatCard label="A receber (30d)" value="R$ 156.800,00" delta="23 títulos em aberto" accent="var(--ina-corporate-light)" />
        <StatCard label="A pagar (30d)" value="R$ 89.340,00" delta="8 vencendo esta semana" accent="var(--ina-gold)" />
        <StatCard label="Inadimplência" value="4,2%" delta="-0,8 pp" accent="var(--ina-coral)" />
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
            <strong>Vencimentos da semana</strong>
          </div>
          <div className="ina-card__body" style={{ padding: 0 }}>
            <table className="ina-table">
              <tbody>
                {DUE_THIS_WEEK.map((row) => (
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
