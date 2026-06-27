"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@inova/ui";
import { login } from "@/lib/auth.client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@inova.local");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await login({ email, password, totp: totp || undefined });
      if (res.mfaRequired) {
        setMfaRequired(true);
        return;
      }
      router.push("/dashboard");
    } catch (err) {
      const e = err as Error & { mfaRequired?: boolean };
      if (e.mfaRequired) {
        setMfaRequired(true);
        setError("Informe o código MFA");
        return;
      }
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ina-login">
      <section className="ina-login__hero" aria-hidden>
        <h1>Inteligência financeira para empresas que escalam.</h1>
        <p>
          ERP multitenant, automação N8N, atendimento omnichannel e agentes de IA — em uma plataforma
          unificada.
        </p>
      </section>
      <section className="ina-login__form">
        <div className="ina-login__card">
          <div style={{ marginBottom: "1.5rem" }}>
            <Logo size={44} />
          </div>
          <h2>Entrar</h2>
          <p>Acesse sua conta Inova Finance AI</p>
          <form onSubmit={handleSubmit}>
            <div className="ina-field">
              <label className="ina-label" htmlFor="email">
                E-mail
              </label>
              <input
                id="email"
                className="ina-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
            <div className="ina-field">
              <label className="ina-label" htmlFor="password">
                Senha
              </label>
              <input
                id="password"
                className="ina-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {mfaRequired && (
              <div className="ina-field">
                <label className="ina-label" htmlFor="totp">
                  Código MFA
                </label>
                <input id="totp" className="ina-input" value={totp} onChange={(e) => setTotp(e.target.value)} />
              </div>
            )}
            {error && (
              <p className="ina-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="ina-btn ina-btn--primary" style={{ width: "100%" }} disabled={loading}>
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
