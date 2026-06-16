import type { PrismaClient } from "@inova/db";

let client: PrismaClient | null = null;
let checked = false;
let available = false;

export async function getDb(): Promise<PrismaClient | null> {
  if (checked) return available ? client : null;

  checked = true;
  if (!process.env.DATABASE_URL) {
    console.warn(JSON.stringify({ level: "warn", message: "DATABASE_URL not set; using in-memory stores" }));
    return null;
  }

  try {
    const { prisma } = await import("@inova/db");
    await prisma.$queryRaw`SELECT 1`;
    client = prisma;
    available = true;
    return client;
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "PostgreSQL unavailable; using in-memory stores",
        detail: error instanceof Error ? error.message : String(error),
      }),
    );
    return null;
  }
}

export function resetDbCacheForTests(): void {
  client = null;
  checked = false;
  available = false;
}
