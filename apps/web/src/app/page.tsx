import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth.server";

export default async function HomePage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.5rem",
        background: "var(--color-bg)",
      }}
    >
      <h1 style={{ fontSize: "2rem", margin: 0, letterSpacing: "-0.03em" }}>Inova Finance AI</h1>
      <p style={{ color: "var(--color-text-muted)", margin: 0 }}>ERP financeiro enterprise com IA</p>
      <Link href="/login" className="ina-btn ina-btn--primary">
        Acessar plataforma
      </Link>
    </main>
  );
}
