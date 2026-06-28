import { Hono } from "hono";
import type { Env, TenantContext, AuthUser } from "../types";
import { verifyJwt } from "../auth";
import { hasPermission } from "../rbac";
import { getDb, resolveConnectionString } from "../db/client";
import { getCashFlow, listPayables, listReceivables, getAgenda } from "../db/finance-store";

type AssistantVars = { tenant: TenantContext; user: AuthUser };

export const assistantRoutes = new Hono<{ Bindings: Env; Variables: AssistantVars }>();

// Exige JWT + finance:read. O tenant é derivado do JWT (C1) → o assistente só
// enxerga os dados do próprio tenant (reforçado pela RLS no banco).
assistantRoutes.use("*", async (c, next) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  const user = await verifyJwt(token, c.env.JWT_SECRET);
  if (!user) return c.json({ error: "Invalid token" }, 401);
  if (!hasPermission(user.role, "finance:read")) return c.json({ error: "Forbidden" }, 403);
  c.set("tenant", { ...c.get("tenant"), tenantId: user.tenantId, userId: user.userId });
  c.set("user", user);
  await next();
});

type Intent = "balance" | "payables" | "receivables" | "agenda" | "unknown";

function detectIntent(question: string): Intent {
  const s = question.toLowerCase();
  if (/(saldo|fluxo|caixa|l[ií]quido)/.test(s)) return "balance";
  if (/(a pagar|pagar|despesa|fornecedor)/.test(s)) return "payables";
  if (/(a receber|receber|cliente|recebimento|inadimpl)/.test(s)) return "receivables";
  if (/(vencimento|agenda|vence|pr[óo]xim)/.test(s)) return "agenda";
  return "unknown";
}

function brl(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

/**
 * Frasear via LLM (OpenRouter) usando APENAS os fatos consultados (JSON). Os números
 * vêm sempre das tools/queries reais — o modelo só formula a frase, nunca inventa
 * valores. Em qualquer falha, retorna null (cai para a resposta determinística).
 */
async function phraseWithLlm(
  apiKey: string,
  question: string,
  facts: Record<string, unknown>,
): Promise<string | null> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "anthropic/claude-3.5-sonnet",
        max_tokens: 300,
        messages: [
          {
            role: "system",
            content:
              "Você é um assistente financeiro corporativo em pt-BR. Responda à pergunta usando " +
              "EXCLUSIVAMENTE os fatos fornecidos em JSON. NUNCA invente ou estime números. " +
              "Seja direto e conciso.",
          },
          { role: "user", content: `Pergunta: ${question}\nFatos (JSON): ${JSON.stringify(facts)}` },
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

assistantRoutes.post("/", async (c) => {
  const tenant = c.get("tenant");
  const body = await c.req.json<{ question?: string }>().catch(() => ({ question: "" }));
  const question = (body.question ?? "").trim();
  if (!question) return c.json({ error: "Pergunta vazia" }, 400);

  const db = await getDb(resolveConnectionString(c.env));
  const intent = detectIntent(question);

  // Tool layer: dados REAIS do tenant (RLS + filtro de aplicação).
  let facts: Record<string, unknown> = {};
  let answer = "";

  switch (intent) {
    case "balance": {
      const cf = await getCashFlow(db, tenant.tenantId);
      facts = cf;
      answer =
        `Seu saldo líquido (a receber em aberto menos a pagar em aberto) é ${brl(cf.net)}. ` +
        `Entradas previstas: ${brl(cf.inflow)}; saídas previstas: ${brl(cf.outflow)}.`;
      break;
    }
    case "payables": {
      const items = await listPayables(db, tenant.tenantId);
      const total = items.reduce((s, p) => s + parseFloat(p.amount), 0);
      facts = { count: items.length, total };
      answer = `Você tem ${items.length} título(s) a pagar somando ${brl(total)}.`;
      break;
    }
    case "receivables": {
      const items = await listReceivables(db, tenant.tenantId);
      const total = items.reduce((s, r) => s + parseFloat(r.amount), 0);
      facts = { count: items.length, total };
      answer = `Você tem ${items.length} título(s) a receber somando ${brl(total)}.`;
      break;
    }
    case "agenda": {
      const items = await getAgenda(db, tenant.tenantId);
      facts = { count: items.length };
      answer = items.length
        ? `Há ${items.length} vencimento(s) registrado(s) na sua agenda financeira.`
        : "Não há vencimentos registrados na sua agenda financeira.";
      break;
    }
    default:
      answer =
        "Posso responder sobre saldo / fluxo de caixa, contas a pagar, contas a receber e " +
        "agenda de vencimentos do seu tenant. Reformule a pergunta nesses termos.";
  }

  let source: "deterministic" | "llm" = "deterministic";
  if (c.env.OPENROUTER_API_KEY && intent !== "unknown") {
    const phrased = await phraseWithLlm(c.env.OPENROUTER_API_KEY, question, facts);
    if (phrased) {
      answer = phrased;
      source = "llm";
    }
  }

  return c.json({ data: { intent, answer, facts, source } });
});
