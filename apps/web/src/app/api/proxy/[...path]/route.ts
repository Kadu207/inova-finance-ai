import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { INA_PORTS } from "@inova/config";
import { SESSION_COOKIE } from "@/lib/auth.client";

function resolveBackendBase(): string {
  if (process.env.APP_API_INTERNAL_URL) {
    return process.env.APP_API_INTERNAL_URL.replace(/\/$/, "");
  }
  return `http://127.0.0.1:${INA_PORTS.appApi}`;
}

async function proxyRequest(req: NextRequest, path: string) {
  const base = resolveBackendBase();
  const url = `${base}/${path}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (key === "host" || key === "connection") return;
    headers.set(key, value);
  });

  // C5: o token de sessão vive em cookie HttpOnly e o browser não o envia como
  // Bearer. Injeta a Authorization a partir do cookie, no servidor.
  if (!headers.has("authorization")) {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }

  const res = await fetch(url, init);
  const body = await res.arrayBuffer();

  return new Response(body, {
    status: res.status,
    headers: res.headers,
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxyRequest(req, path.join("/"));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxyRequest(req, path.join("/"));
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxyRequest(req, path.join("/"));
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxyRequest(req, path.join("/"));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxyRequest(req, path.join("/"));
}
