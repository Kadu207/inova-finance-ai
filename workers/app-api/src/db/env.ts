import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Load DATABASE_URL from packages/db/.env when running dev-node locally. */
export function loadDatabaseEnv(): void {
  if (process.env.DATABASE_URL) return;

  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, "../../../../packages/db/.env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^DATABASE_URL=(.+)$/);
    if (!match?.[1]) continue;
    let value = match[1].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env.DATABASE_URL = value;
    return;
  }
}
