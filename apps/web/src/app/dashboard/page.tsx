import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth.server";
import { DashboardShell } from "@/components/dashboard-shell";
import { DashboardClient } from "@/components/dashboard-client";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardShell>
      <h1 className="ina-page-title">Dashboard</h1>
      <p className="ina-page-subtitle">Visão consolidada do fluxo financeiro — tenant demo</p>
      <DashboardClient />
    </DashboardShell>
  );
}
