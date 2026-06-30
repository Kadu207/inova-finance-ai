import type { AuthUser } from "./types";
import { generateOpaqueToken, sha256Hex } from "./auth";

/**
 * Refresh tokens com ROTAÇÃO (uso único) e REVOGAÇÃO, persistidos no KV (SESSIONS).
 *
 * - O token entregue ao cliente é opaco e aleatório; no KV guardamos só o SHA-256 dele
 *   (`refresh:<hash>`), nunca o token cru — um vazamento do KV não dá tokens utilizáveis.
 * - `consumeRefreshToken` APAGA o registro ao validar: o refresh é de uso único. O /refresh
 *   emite um novo par, então reutilizar um refresh já usado falha (defesa contra replay).
 * - `revokeRefreshToken` (logout) apaga o registro → a sessão não renova mais.
 */
export type RefreshRecord = {
  userId: string;
  email: string;
  tenantId: string;
  role: string;
  branchIds: string[];
  exp: number; // epoch seconds
};

const PREFIX = "refresh:";
export const REFRESH_TTL_SEC = 60 * 60 * 24 * 7; // 7 dias

function keyFor(hash: string): string {
  return `${PREFIX}${hash}`;
}

export async function issueRefreshToken(kv: KVNamespace, user: AuthUser, ttlSec = REFRESH_TTL_SEC): Promise<string> {
  const raw = generateOpaqueToken();
  const hash = await sha256Hex(raw);
  const rec: RefreshRecord = {
    userId: user.userId,
    email: user.email,
    tenantId: user.tenantId,
    role: user.role,
    branchIds: user.branchIds,
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  };
  await kv.put(keyFor(hash), JSON.stringify(rec), { expirationTtl: ttlSec });
  return raw;
}

/** Valida e CONSOME (apaga) o refresh token. Retorna o registro, ou null se inválido/expirado. */
export async function consumeRefreshToken(kv: KVNamespace, raw: string): Promise<RefreshRecord | null> {
  const key = keyFor(await sha256Hex(raw));
  const rec = await kv.get<RefreshRecord>(key, "json");
  if (!rec) return null;
  await kv.delete(key); // uso único (rotação)
  if (rec.exp < Math.floor(Date.now() / 1000)) return null;
  return rec;
}

/** Revoga (apaga) o refresh token — usado no logout. Idempotente. */
export async function revokeRefreshToken(kv: KVNamespace, raw: string): Promise<void> {
  await kv.delete(keyFor(await sha256Hex(raw)));
}
