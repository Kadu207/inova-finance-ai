import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth.server";
import { DashboardShell } from "@/components/dashboard-shell";
import { PayablesClient } from "@/components/payables-client";

export default async function PayablesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardShell>
      <h1 className="ina-page-title">Contas a Pagar</h1>
      <p className="ina-page-subtitle">Gestão de obrigações e fluxo de saída</p>
      <PayablesClient />
    </DashboardShell>
  );
}
