/**
 * Lógica pura dos 12 agentes de negócio (testável sem Durable Object).
 *
 * Padrão "gated" igual ao assistente do app-api: as respostas são GROUNDED (fatos reais
 * do tenant vêm do app-api via service binding, encaminhando o token do usuário) e o LLM
 * (OpenRouter) só FRASEIA — nunca inventa números. Sem OPENROUTER_API_KEY (ou em falha),
 * cai para uma resposta determinística. A IA real liga sozinha quando a chave responder 200.
 */

export const BUSINESS_AGENTS = [
  "ceo", "cfo", "financeiro", "cobranca", "compras", "fiscal",
  "estoque", "comercial", "juridico", "contratos", "auditor", "suporte",
] as const;

export type BusinessAgentId = (typeof BUSINESS_AGENTS)[number];

/** Ferramentas (permissões) que cada agente pode usar — base do RBAC por agente. */
export const AGENT_TOOLS: Record<BusinessAgentId, string[]> = {
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

const AGENT_LABEL: Record<BusinessAgentId, string> = {
  ceo: "CEO", cfo: "CFO", financeiro: "Financeiro", cobranca: "Cobrança",
  compras: "Compras", fiscal: "Fiscal", estoque: "Estoque", comercial: "Comercial",
  juridico: "Jurídico", contratos: "Contratos", auditor: "Auditor", suporte: "Suporte",
};

/** Persona (papel) de cada agente, em pt-BR — base do system prompt. */
export const AGENT_PERSONAS: Record<BusinessAgentId, string> = {
  ceo: "Você dá a visão executiva do negócio, consolida indicadores e aciona os demais agentes.",
  cfo: "Você cuida das finanças corporativas: saldo, fluxo de caixa e decisões financeiras.",
  financeiro: "Você opera o dia a dia financeiro: contas a pagar, a receber e lançamentos.",
  cobranca: "Você conduz a cobrança e a inadimplência, inclusive a régua via integrações.",
  compras: "Você trata de compras e fornecedores, em relação com o estoque.",
  fiscal: "Você cuida de notas fiscais, impostos e leitura (OCR) de documentos fiscais.",
  estoque: "Você controla o estoque: entradas, saídas e níveis.",
  comercial: "Você atua em vendas e CRM, conectando-se aos recebíveis.",
  juridico: "Você faz a análise jurídica e a leitura de contratos.",
  contratos: "Você gerencia contratos: criação, edição e acompanhamento.",
  auditor: "Você faz auditoria e conformidade, lendo logs (append-only) e finanças.",
  suporte: "Você atende o cliente, integrando-se ao Chatwoot.",
};

export function agentTools(agentId: BusinessAgentId): string[] {
  return AGENT_TOOLS[agentId] ?? [];
}

/** RBAC por agente: o agente só pode usar ferramentas da sua lista. */
export function agentCanUseTool(agentId: BusinessAgentId, tool: string): boolean {
  return agentTools(agentId).includes(tool);
}

export function systemPromptFor(agentId: BusinessAgentId): string {
  return (
    `Você é o agente ${AGENT_LABEL[agentId]} da Inova Finance AI (ERP financeiro multitenant). ` +
    `${AGENT_PERSONAS[agentId]} ` +
    `Ferramentas disponíveis: ${agentTools(agentId).join(", ")}. ` +
    `Responda em português do Brasil, de forma objetiva. Use EXCLUSIVAMENTE os fatos fornecidos (JSON); ` +
    `NUNCA invente ou estime números. Se faltar dado, diga que não tem essa informação.`
  );
}

function brl(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function groundingSentence(facts: Record<string, unknown>): string {
  if (typeof facts.net === "number") {
    const parts = [`saldo líquido ${brl(facts.net)}`];
    if (typeof facts.inflow === "number") parts.push(`entradas ${brl(facts.inflow)}`);
    if (typeof facts.outflow === "number") parts.push(`saídas ${brl(facts.outflow)}`);
    return ` Dados do tenant: ${parts.join(", ")}.`;
  }
  return "";
}

/** Resposta determinística (sem LLM): persona + fatos reais (se houver) + aviso do modo. */
export function deterministicReply(agentId: BusinessAgentId, message: string, facts: Record<string, unknown>): string {
  return (
    `[${AGENT_LABEL[agentId]}] ${AGENT_PERSONAS[agentId]}` +
    groundingSentence(facts) +
    ` (modo determinístico — defina OPENROUTER_API_KEY para respostas geradas por IA).` +
    ` Sua mensagem: "${message.slice(0, 200)}".`
  );
}

/** Fraseia via LLM (OpenRouter), gated. Retorna null em qualquer falha (→ fallback). */
export async function phraseWithLlm(
  apiKey: string,
  system: string,
  message: string,
  facts: Record<string, unknown>,
): Promise<string | null> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "anthropic/claude-3.5-sonnet",
        max_tokens: 400,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Mensagem: ${message}\nFatos (JSON): ${JSON.stringify(facts)}` },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

/** Monta a resposta do agente: LLM se houver chave válida, senão determinística. */
export async function buildAgentReply(opts: {
  agentId: BusinessAgentId;
  tenantId: string;
  message: string;
  facts?: Record<string, unknown>;
  apiKey?: string;
}): Promise<{ reply: string; source: "llm" | "deterministic" }> {
  const facts = opts.facts ?? {};
  if (opts.apiKey) {
    const phrased = await phraseWithLlm(opts.apiKey, systemPromptFor(opts.agentId), opts.message, facts);
    if (phrased) return { reply: phrased, source: "llm" };
  }
  return { reply: deterministicReply(opts.agentId, opts.message, facts), source: "deterministic" };
}

/**
 * Busca fatos reais do tenant no app-api (via service binding), ENCAMINHANDO o token do
 * usuário — o app-api aplica RBAC + tenant do JWT + RLS. Só busca se o agente tiver
 * `finance:read`. Sem binding/token, ou em qualquer falha, retorna {} (resposta sem grounding).
 */
export async function fetchTenantFacts(
  appApi: Fetcher | undefined,
  token: string | null,
  tenantId: string,
  agentId: BusinessAgentId,
): Promise<Record<string, unknown>> {
  if (!appApi || !token || !agentCanUseTool(agentId, "finance:read")) return {};
  try {
    const res = await appApi.fetch(
      new Request("https://app-api/api/finance/cash-flow", {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId,
          "X-Correlation-Id": crypto.randomUUID(),
        },
      }),
    );
    if (!res.ok) return {};
    const json = (await res.json()) as { data?: Record<string, unknown> } & Record<string, unknown>;
    return json.data ?? json;
  } catch {
    return {};
  }
}
