import type { Env } from "./types";

/**
 * In-memory KV for local Node dev (when wrangler/workerd fails on Windows).
 * Não implementa o tipo `KVNamespace` (cujas sobrecargas de `get` são bem mais
 * amplas); é um mock mínimo, convertido em `createLocalEnv` via `as unknown`.
 */
export class MemoryKV {
  private store = new Map<string, string>();

  async get(key: string, type?: "text"): Promise<string | null>;
  async get<T>(key: string, type: "json"): Promise<T | null>;
  async get(key: string, type: "text" | "json" = "text"): Promise<unknown> {
    const value = this.store.get(key);
    if (value === undefined) return null;
    if (type === "json") return JSON.parse(value) as unknown;
    return value;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export function createLocalEnv(): Env {
  const sessions = new MemoryKV();

  return {
    ENVIRONMENT: "development",
    JWT_SECRET: process.env.JWT_SECRET ?? "dev-jwt-secret-min-32-characters-long",
    VPS_WEBHOOK_SECRET: process.env.VPS_WEBHOOK_SECRET ?? "dev-webhook-secret-min-32-chars",
    SESSIONS: sessions as unknown as KVNamespace,
    HYPERDRIVE: {} as Hyperdrive,
    MESSAGING: {
      fetch: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    } as unknown as Fetcher,
    EVENTS_QUEUE: {
      send: async (body: unknown) => {
        console.log(JSON.stringify({ level: "info", event: "queue.send", body }));
      },
    } as unknown as Queue,
  };
}
