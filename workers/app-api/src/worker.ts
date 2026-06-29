import app from "./app";
import type { Env } from "./types";
import { getDb, resolveConnectionString, setRuntimeEnvironment } from "./db/client";
import { runRecurrencesAllTenants } from "./db/recurrences-store";

/**
 * Cron mensal: gera os títulos das recorrências ativas de todos os tenants para o
 * mês corrente. Idempotente (idempotencyKey `recur:<id>:<mês>`), então uma re-execução
 * acidental do trigger não duplica. Configurado em wrangler.jsonc → triggers.crons.
 */
async function runMonthlyRecurrences(env: Env): Promise<void> {
  setRuntimeEnvironment(env.ENVIRONMENT);
  const month = new Date().toISOString().slice(0, 7);
  const db = await getDb(resolveConnectionString(env));
  const result = await runRecurrencesAllTenants(db, month);
  console.log(JSON.stringify({ level: "info", event: "recurrence.cron.done", month, ...result }));
}

export default {
  fetch: app.fetch,
  scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runMonthlyRecurrences(env));
  },
} satisfies ExportedHandler<Env>;
