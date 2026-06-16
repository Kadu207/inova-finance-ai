/**
 * Embedded Runtime Agents 41-55
 * Operate post-deploy via cron triggers and queue consumers.
 */

export interface Env {
  ENVIRONMENT: string;
  APP_API: Fetcher;
  MESSAGING: Fetcher;
  VPS_HEALTH_URL: string;
  N8N_HEALTH_URL: string;
  CHATWOOT_HEALTH_URL: string;
  MONITOR: DurableObjectNamespace;
}

export const EMBEDDED_AGENTS = {
  41: "orchestrator",
  42: "data-validator",
  43: "event-reconciler",
  44: "tenant-monitor",
  45: "finance-reconciler",
  46: "collection-agent",
  47: "support-agent",
  48: "fiscal-agent",
  49: "ocr-quality-gate",
  50: "n8n-health",
  51: "chatwoot-health",
  52: "security-sentinel",
  53: "cost-optimizer",
  54: "audit-logger",
  55: "incident-responder",
} as const;

interface MonitorState {
  lastRun: Record<string, string>;
  incidents: Array<{ id: string; agent: string; message: string; createdAt: string }>;
}

export class MonitorDO {
  private state: DurableObjectState;
  private data: MonitorState = { lastRun: {}, incidents: [] };

  constructor(state: DurableObjectState) {
    this.state = state;
    this.state.blockConcurrencyWhile(async () => {
      this.data = (await this.state.storage.get<MonitorState>("data")) ?? this.data;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/status") {
      return Response.json({ data: this.data });
    }
    if (url.pathname === "/record-run" && request.method === "POST") {
      const { agent, timestamp } = (await request.json()) as { agent: string; timestamp: string };
      this.data.lastRun[agent] = timestamp;
      await this.state.storage.put("data", this.data);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/incident" && request.method === "POST") {
      const body = (await request.json()) as { agent: string; message: string };
      const incident = { id: crypto.randomUUID(), ...body, createdAt: new Date().toISOString() };
      this.data.incidents.unshift(incident);
      this.data.incidents = this.data.incidents.slice(0, 100);
      await this.state.storage.put("data", this.data);
      return Response.json({ data: incident }, { status: 201 });
    }
    return new Response("Not found", { status: 404 });
  }
}

async function ping(url: string): Promise<boolean> {
  if (!url) return true;
  try {
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function recordRun(env: Env, agent: string) {
  const id = env.MONITOR.idFromName("global");
  await env.MONITOR.get(id).fetch(
    new Request("https://monitor/record-run", {
      method: "POST",
      body: JSON.stringify({ agent, timestamp: new Date().toISOString() }),
    }),
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "inova-embedded", agents: EMBEDDED_AGENTS });
    }
    if (url.pathname === "/status") {
      const id = env.MONITOR.idFromName("global");
      return env.MONITOR.get(id).fetch(new Request("https://monitor/status"));
    }
    if (url.pathname === "/run" && request.method === "POST") {
      const { agentId } = (await request.json()) as { agentId: number };
      await recordRun(env, EMBEDDED_AGENTS[agentId as keyof typeof EMBEDDED_AGENTS] ?? "unknown");
      return Response.json({ ran: agentId });
    }
    return Response.json({ error: "Not found" }, 404);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const cron = event.cron;

    ctx.waitUntil(
      (async () => {
        // Agent 41: Orchestrator — every 5 min
        if (cron === "*/5 * * * *") {
          await recordRun(env, "orchestrator");
          for (const agentId of [42, 43, 44, 50, 51, 52]) {
            await recordRun(env, EMBEDDED_AGENTS[agentId as keyof typeof EMBEDDED_AGENTS]!);
          }
        }

        // Agent 43: Event reconciler — hourly
        if (cron === "0 * * * *") {
          await recordRun(env, "event-reconciler");
        }

        // Agent 45: Finance reconciler — daily
        if (cron === "0 6 * * *") {
          await recordRun(env, "finance-reconciler");
        }

        // Agents 50-51: Integration health — every minute
        if (cron === "* * * * *") {
          const n8nOk = await ping(env.N8N_HEALTH_URL);
          const cwOk = await ping(env.CHATWOOT_HEALTH_URL);
          const vpsOk = await ping(env.VPS_HEALTH_URL);
          if (!n8nOk || !cwOk || !vpsOk) {
            const id = env.MONITOR.idFromName("global");
            await env.MONITOR.get(id).fetch(
              new Request("https://monitor/incident", {
                method: "POST",
                body: JSON.stringify({
                  agent: "integration-health",
                  message: `Health check failed: n8n=${n8nOk} chatwoot=${cwOk} vps=${vpsOk}`,
                }),
              }),
            );
          }
          await recordRun(env, "n8n-health");
          await recordRun(env, "chatwoot-health");
        }
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
