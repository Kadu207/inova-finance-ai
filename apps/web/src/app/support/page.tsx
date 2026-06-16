import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth.server";
import { DashboardShell } from "@/components/dashboard-shell";
import { ChatwootPanel } from "@/components/chatwoot-panel";

export default async function SupportPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardShell>
      <h1 className="ina-page-title">Atendimento</h1>
      <p className="ina-page-subtitle">
        Inbox unificada — conversas sincronizadas com Chatwoot e títulos AR
      </p>
      <ChatwootPanel />
    </DashboardShell>
  );
}
