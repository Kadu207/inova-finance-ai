import { describe, it, expect, vi, afterEach } from "vitest";
import {
  BUSINESS_AGENTS,
  AGENT_PERSONAS,
  agentTools,
  agentCanUseTool,
  systemPromptFor,
  buildAgentReply,
  fetchTenantFacts,
} from "./agents";

describe("agentes — metadados e RBAC", () => {
  it("12 agentes, cada um com persona e ao menos uma ferramenta", () => {
    expect(BUSINESS_AGENTS).toHaveLength(12);
    for (const a of BUSINESS_AGENTS) {
      expect(AGENT_PERSONAS[a]).toBeTruthy();
      expect(agentTools(a).length).toBeGreaterThan(0);
    }
  });

  it("RBAC por agente: cfo pode finance:write, juridico não", () => {
    expect(agentCanUseTool("cfo", "finance:write")).toBe(true);
    expect(agentCanUseTool("juridico", "finance:write")).toBe(false);
  });

  it("system prompt inclui as ferramentas do agente", () => {
    expect(systemPromptFor("fiscal")).toContain("fiscal:read");
  });
});

describe("buildAgentReply — gated (LLM com fallback)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sem chave → resposta determinística com os fatos reais embutidos", async () => {
    const r = await buildAgentReply({
      agentId: "cfo",
      tenantId: "t1",
      message: "como está o caixa?",
      facts: { net: 1000, inflow: 3000, outflow: 2000 },
    });
    expect(r.source).toBe("deterministic");
    expect(r.reply).toContain("CFO");
    expect(r.reply).toMatch(/saldo líquido/i);
  });

  it("com chave válida (mock) → usa o LLM", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "Resposta da IA" } }] }), { status: 200 }),
    );
    const r = await buildAgentReply({ agentId: "cfo", tenantId: "t1", message: "oi", apiKey: "sk-test" });
    expect(r.source).toBe("llm");
    expect(r.reply).toBe("Resposta da IA");
  });

  it("LLM falha (401) → cai para determinístico", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const r = await buildAgentReply({ agentId: "cfo", tenantId: "t1", message: "oi", apiKey: "sk-bad" });
    expect(r.source).toBe("deterministic");
  });
});

describe("fetchTenantFacts — grounding via service binding (gated)", () => {
  it("sem token → {} (não consulta)", async () => {
    let called = false;
    const appApi = { fetch: async () => { called = true; return new Response("{}", { status: 200 }); } } as unknown as Fetcher;
    expect(await fetchTenantFacts(appApi, null, "t1", "cfo")).toEqual({});
    expect(called).toBe(false);
  });

  it("agente sem finance:read → {} (não consulta)", async () => {
    let called = false;
    const appApi = { fetch: async () => { called = true; return new Response("{}", { status: 200 }); } } as unknown as Fetcher;
    expect(await fetchTenantFacts(appApi, "tok", "t1", "juridico")).toEqual({});
    expect(called).toBe(false);
  });

  it("com token + finance:read → retorna os fatos do app-api", async () => {
    const appApi = {
      fetch: async () => new Response(JSON.stringify({ data: { net: 500, inflow: 800, outflow: 300 } }), { status: 200 }),
    } as unknown as Fetcher;
    expect(await fetchTenantFacts(appApi, "tok", "t1", "cfo")).toEqual({ net: 500, inflow: 800, outflow: 300 });
  });

  it("app-api responde erro → {} (resposta sem grounding)", async () => {
    const appApi = { fetch: async () => new Response("nope", { status: 500 }) } as unknown as Fetcher;
    expect(await fetchTenantFacts(appApi, "tok", "t1", "cfo")).toEqual({});
  });
});
