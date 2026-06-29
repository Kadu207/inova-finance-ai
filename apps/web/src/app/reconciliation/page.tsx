import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth.server";
import { DashboardShell } from "@/components/dashboard-shell";
import { ReconciliationClient } from "@/components/reconciliation-client";

export default async function ReconciliationPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardShell>
      <h1 className="ina-page-title">Conciliação bancária</h1>
      <p className="ina-page-subtitle">Importe o extrato (OFX) e revise os lançamentos conciliados automaticamente</p>
      <ReconciliationClient />
    </DashboardShell>
  );
}
