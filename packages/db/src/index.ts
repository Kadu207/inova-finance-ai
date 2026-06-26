import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

export * from "@prisma/client";

/**
 * Cria um PrismaClient usando o driver adapter `pg`. Funciona tanto no Node
 * (dev-node, conexão direta) quanto em Cloudflare Workers com `nodejs_compat`,
 * onde a connectionString vem do binding Hyperdrive
 * (`env.HYPERDRIVE.connectionString`). Sem o adapter o Prisma Client não roda
 * no runtime de Workers — esta é a peça que faltava (C2).
 */
export function createPrismaClient(connectionString: string): PrismaClient {
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter, log: ["error"] });
}

export type TenantContext = {
  tenantId: string;
  branchId?: string;
  correlationId: string;
  userId?: string;
};

export function assertTenantContext(ctx: Partial<TenantContext>): asserts ctx is TenantContext {
  if (!ctx.tenantId || !ctx.correlationId) {
    throw new Error("Missing required tenant context: tenantId and correlationId");
  }
}
