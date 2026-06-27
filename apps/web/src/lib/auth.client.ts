export const SESSION_COOKIE = "inova_session";

type LoginResult = { role?: string; mfaRequired?: boolean };

/**
 * Faz login via route handler server-side (`/api/auth/login`), que seta o cookie
 * de sessão HttpOnly+Secure. O token nunca fica acessível ao JS do navegador (C5),
 * eliminando o roubo de sessão por XSS.
 */
export async function login(body: { email: string; password: string; totp?: string }): Promise<LoginResult> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as LoginResult & { error?: string };
  if (!res.ok) {
    const err = new Error(data.error ?? "Falha no login") as Error & { mfaRequired?: boolean };
    err.mfaRequired = data.mfaRequired;
    throw err;
  }
  return data;
}

/** Encerra a sessão limpando o cookie HttpOnly via route handler. */
export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}
