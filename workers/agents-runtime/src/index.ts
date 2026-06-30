import {
  BUSINESS_AGENTS,
  type BusinessAgentId,
  agentTools,
  buildAgentReply,
  fetchTenantFacts,
} from "./agents";

export { BUSINESS_AGENTS, type BusinessAgentId } from "./agents";

export interface Env {
  ENVIRONMENT: string;
  /** Opcional — habilita o LLM (OpenRouter). Sem ela, respostas determinísticas. */
  OPENROUTER_API_KEY?: string;
  MESSAGING: Fetcher;
  /** Service binding para o app-api: grounding com dados reais do tenant. */
  APP_API?: Fetcher;
  AGENT: DurableObjectNamespace;
}

interface AgentState {
  agentId: BusinessAgentId;
  tenantId: string;
  messages: Array<{ role: string; content: string; at: string }>;
}

export class InovaBusinessAgent {
  private state: DurableObjectState;
  private env: Env;
  private agentState: AgentState = { agentId: "suporte", tenantId: "", messages: [] };

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.state.blockConcurrencyWhile(async () => {
      this.agentState = (await this.state.storage.get<AgentState>("agent")) ?? this.agentState;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const agentId = (url.searchParams.get("agent") ?? this.agentState.agentId) as BusinessAgentId;
    const tenantId = request.headers.get("X-Tenant-Id") ?? this.agentState.tenantId;

    if (!BUSINESS_AGENTS.includes(agentId)) {
      return Response.json({ error: "Agente inválido" }, { status: 400 });
    }
    if (!tenantId) {
      return Response.json({ error: "Missing X-Tenant-Id" }, { status: 400 });
    }

    this.agentState.agentId = agentId;
    this.agentState.tenantId = tenantId;

    if (request.method === "GET" && url.pathname === "/tools") {
      return Response.json({ agentId, tools: agentTools(agentId) });
    }

    if (request.method === "POST" && url.pathname === "/chat") {
      const body = await request.json<{ message: string; role?: string }>();
      const entry = { role: body.role ?? "user", content: body.message, at: new Date().toISOString() };
      this.agentState.messages.push(entry);

      // Grounding: dados reais do tenant via app-api, encaminhando o token do usuário.
      const token = request.headers.get("Authorization")?.replace("Bearer ", "") ?? null;
      const facts = await fetchTenantFacts(this.env.APP_API, token, tenantId, agentId);

      const { reply, source } = await buildAgentReply({
        agentId,
        tenantId,
        message: body.message,
        facts,
        apiKey: this.env.OPENROUTER_API_KEY,
      });

      this.agentState.messages.push({ role: "assistant", content: reply, at: new Date().toISOString() });
      await this.state.storage.put("agent", this.agentState);

      return Response.json({
        agentId,
        tenantId,
        reply,
        source,
        toolsAvailable: agentTools(agentId),
        correlationId: request.headers.get("X-Correlation-Id") ?? crypto.randomUUID(),
      });
    }

    await this.state.storage.put("agent", this.agentState);
    return Response.json({ agentId, tenantId, status: "ready", agents: BUSINESS_AGENTS });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "inova-agents", agents: BUSINESS_AGENTS });
    }

    const tenantId = request.headers.get("X-Tenant-Id") ?? "default";
    const agentName = url.searchParams.get("agent") ?? "suporte";
    const id = env.AGENT.idFromName(`${tenantId}:${agentName}`);
    const stub = env.AGENT.get(id);
    return stub.fetch(request);
  },
} satisfies ExportedHandler<Env>;
