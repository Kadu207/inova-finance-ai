import type { Prisma, PrismaClient } from "@inova/db";
import type { Env } from "../types";

const clients = new Map<string, PrismaClient>();

/**
 * Resolve a connection string do Postgres: prioriza o binding Hyperdrive
 * (Cloudflare Worker) e cai para `DATABASE_URL` no Node dev (dev-node). Retorna
 * null quando não há banco configurado (usa stores em memória).
 */
export function resolveConnectionString(env: Env): string | null {
  const hyper = env.HYPERDRIVE?.connectionString;
  if (hyper) return hyper;
  if (typeof process !== "undefined" && process.env?.DATABASE_URL) return process.env.DATABASE_URL;
  return null;
}

/**
 * Retorna um PrismaClient para a connection string informada, ou null para
 * usar os stores em memória. Cacheia um client por connection string por
 * isolate. Em falha de conexão, retorna null (fallback in-memory) sem cachear,
 * permitindo reconexão em requisições futuras.
 */
export async function getDb(connectionString: string | null): Promise<PrismaClient | null> {
  // Sem connection string configurada → stores em memória (dev/test).
  if (!connectionString) return null;
  const cached = clients.get(connectionString);
  if (cached) return cached;

  const { createPrismaClient } = await import("@inova/db");
  const client = createPrismaClient(connectionString);
  try {
    await client.$queryRaw`SELECT 1`;
  } catch (error) {
    // B3 — com banco configurado, uma falha de conexão NÃO cai silenciosamente
    // para in-memory (perderia escritas financeiras). Propaga → 500 explícito.
    await client.$disconnect().catch(() => {});
    console.error(
      JSON.stringify({
        level: "error",
        message: "Falha ao conectar no PostgreSQL configurado",
        detail: error instanceof Error ? error.message : String(error),
      }),
    );
    throw error;
  }
  clients.set(connectionString, client);
  return client;
}

/**
 * Executa `fn` dentro de uma transação com `app.tenant_id` setado LOCALmente,
 * habilitando as policies de Row-Level Security no Postgres — defense-in-depth do
 * isolamento multitenant (C1). O `set_config(..., true)` é LOCAL à transação, então
 * é seguro com pool de conexões (reseta no commit/rollback). Mesmo que um filtro de
 * aplicação `where: { tenantId }` falhe, o banco não retorna linhas de outro tenant.
 */
export function withTenantScope<T>(
  db: PrismaClient,
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}

export function resetDbCacheForTests(): void {
  for (const client of clients.values()) {
    void client.$disconnect().catch(() => {});
  }
  clients.clear();
}
