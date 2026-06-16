export const SESSION_COOKIE = "inova_session";

export function setSession(token: string) {
  document.cookie = `${SESSION_COOKIE}=${token}; path=/; SameSite=Lax`;
}

export function clearSession() {
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
}

export function getClientSession(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
