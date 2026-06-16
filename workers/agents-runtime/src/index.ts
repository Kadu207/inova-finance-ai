export interface Env {
  ENVIRONMENT: string;
  OPENROUTER_API_KEY: string;
  MESSAGING: Fetcher;
  AGENT: DurableObjectNamespace;
}

export const BUSINESS_AGENTS = [
  "ceo", "cfo", "financeiro", "cobranca", "compras", "fiscal",
  "estoque", "comercial", "juridico", "contratos", "auditor", "suporte",
] as const;

export type BusinessAgentId = (typeof BUSINESS_AGENTS)[number];

const AGENT_TOOLS: Record<BusinessAgentId, string[]> = {
  ceo: ["reports:read", "agents:invoke"],
  cfo: ["finance:read", "finance:write", "reports:read"],
  financeiro: ["finance:read", "finance:write"],
  cobranca: ["finance:read", "integrations:n8n"],
  compras: ["finance:read", "inventory:read"],
  fiscal: ["fiscal:read", "ocr:read"],
  estoque: ["inventory:read", "inventory:write"],
  comercial: ["crm:read", "finance:read"],
  juridico: ["contracts:read"],
  contratos: ["contracts:read", "contracts:write"],
  auditor: ["audit:read", "finance:read"],
  suporte: ["support:read", "integrations:chatwoot"],
};

interface AgentState {
  agentId: BusinessAgentId;
  tenantId: string;
  messages: Array<{ role: string; content: string; at: string }>;
}

export class InovaBusinessAgent {
  private state: DurableObjectState;
  private agentState: AgentState = { agentId: "suporte", tenantId: "", messages: [] };

  constructor(state: DurableObjectState) {
    this.state = state;
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
      return Response.json({ agentId, tools: AGENT_TOOLS[agentId] });
    }

    if (request.method === "POST" && url.pathname === "/chat") {
      const body = await request.json<{ message: string; role?: string }>();
      const entry = { role: body.role ?? "user", content: body.message, at: new Date().toISOString() };
      this.agentState.messages.push(entry);
      const reply = `[${agentId}] Processando no tenant ${tenantId}: ${body.message.slice(0, 200)}`;
      this.agentState.messages.push({ role: "assistant", content: reply, at: new Date().toISOString() });
      await this.state.storage.put("agent", this.agentState);

      return Response.json({
        agentId,
        tenantId,
        reply,
        toolsAvailable: AGENT_TOOLS[agentId],
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
