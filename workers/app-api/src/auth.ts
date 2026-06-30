import type { AuthUser } from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Comparação de strings em tempo constante (B6 — evita timing attack). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** base64url (B5 — JWT compatível com RFC 7515, URL-safe e sem padding). */
function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncodeString(value: string): string {
  return base64UrlEncode(encoder.encode(value));
}

function base64UrlDecodeToBytes(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (input.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function base64UrlDecodeToString(input: string): string {
  return decoder.decode(base64UrlDecodeToBytes(input));
}

/** Token opaco aleatório (URL-safe), usado como refresh token — NÃO é um JWT. */
export function generateOpaqueToken(bytes = 32): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** SHA-256 em hex. Guardamos o HASH do refresh token no KV (nunca o token cru). */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256,
  );
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
  const saltB64 = btoa(String.fromCharCode(...salt));
  return `${saltB64}:${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltB64, expectedHash] = stored.split(":");
  if (!saltB64 || !expectedHash) return false;
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256,
  );
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return timingSafeEqual(hash, expectedHash);
}

/**
 * Escopo do token. Sem escopo (`undefined`) = token de sessão pleno. `mfa-enrollment`
 * = token restrito, emitido a admin/owner que ainda precisa habilitar o MFA obrigatório;
 * só é aceito por `/auth/mfa/setup` e `/auth/mfa/verify` (ver `verifyJwt`).
 */
export type JwtScope = "mfa-enrollment";

export async function signJwt(user: AuthUser, secret: string, expiresInSec = 3600, scope?: JwtScope): Promise<string> {
  const header = base64UrlEncodeString(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncodeString(
    JSON.stringify({
      sub: user.userId,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
      branchIds: user.branchIds,
      ...(scope ? { scope } : {}),
      exp: Math.floor(Date.now() / 1000) + expiresInSec,
    }),
  );
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const signature = base64UrlEncode(new Uint8Array(sig));
  return `${data}.${signature}`;
}

/**
 * Verifica o JWT. Por padrão, tokens de escopo restrito (ex.: `mfa-enrollment`) são
 * REJEITADOS — assim um token de enrolamento nunca alcança rotas protegidas. Passe
 * `{ allowEnrollment: true }` apenas em `/auth/mfa/*` para aceitar o enrolamento.
 */
export async function verifyJwt(
  token: string,
  secret: string,
  opts: { allowEnrollment?: boolean } = {},
): Promise<AuthUser | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];

  // B5 — valida o algoritmo declarado no header (defesa contra "alg confusion").
  let head: { alg?: string; typ?: string };
  try {
    head = JSON.parse(base64UrlDecodeToString(header)) as { alg?: string; typ?: string };
  } catch {
    return null;
  }
  if (head.alg !== "HS256") return null;

  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  let sigBytes: Uint8Array;
  try {
    sigBytes = base64UrlDecodeToBytes(signature);
  } catch {
    return null;
  }
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(data));
  if (!valid) return null;

  let decoded: {
    sub: string;
    email: string;
    tenantId: string;
    role: string;
    branchIds: string[];
    scope?: string;
    exp: number;
  };
  try {
    decoded = JSON.parse(base64UrlDecodeToString(payload));
  } catch {
    return null;
  }
  if (decoded.exp < Math.floor(Date.now() / 1000)) return null;
  // Token de enrolamento de MFA só vale nas rotas /auth/mfa/* (allowEnrollment).
  if (decoded.scope === "mfa-enrollment" && !opts.allowEnrollment) return null;
  return {
    userId: decoded.sub,
    email: decoded.email,
    tenantId: decoded.tenantId,
    role: decoded.role,
    branchIds: decoded.branchIds ?? [],
  };
}
