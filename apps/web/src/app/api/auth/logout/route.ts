import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth.client";

/** Encerra a sessão removendo o cookie HttpOnly. */
export async function POST() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
