import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth.server";
import { DashboardShell } from "@/components/dashboard-shell";
import { ReceivablesClient } from "@/components/receivables-client";

export default async function ReceivablesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardShell>
      <h1 className="ina-page-title">Contas a Receber</h1>
      <p className="ina-page-subtitle">Cobrança, promissórias e renegociação</p>
      <ReceivablesClient />
    </DashboardShell>
  );
}
