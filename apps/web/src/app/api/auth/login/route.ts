import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { INA_PORTS } from "@inova/config";
import { SESSION_COOKIE } from "@/lib/auth.client";

function backendBase(): string {
  return process.env.APP_API_INTERNAL_URL?.replace(/\/$/, "") ?? `http://127.0.0.1:${INA_PORTS.appApi}`;
}

/**
 * Login server-side: encaminha as credenciais ao Worker e, em caso de sucesso,
 * grava o JWT num cookie HttpOnly+Secure. O token nunca é devolvido ao browser (C5).
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const res = await fetch(`${backendBase()}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-Id": req.headers.get("X-Tenant-Id") ?? "demo-tenant",
    },
    body,
  });

  const data = (await res.json().catch(() => ({}))) as {
    token?: string;
    role?: string;
    mfaRequired?: boolean;
    error?: string;
  };

  if (res.ok && data.token) {
    const store = await cookies();
    store.set(SESSION_COOKIE, data.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60, // 1h — alinhado ao exp do JWT
    });
    return Response.json({ role: data.role });
  }

  return Response.json(
    { error: data.error ?? "Falha no login", mfaRequired: data.mfaRequired },
    { status: res.status || 401 },
  );
}
