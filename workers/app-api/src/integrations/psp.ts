import type { Env } from "../types";

export type ChargeMethod = "boleto" | "pix";

export type ChargeRequest = {
  amount: string;
  method: ChargeMethod;
  customerName: string;
  dueDate: string; // YYYY-MM-DD
  reference: string; // id interno (receivableId)
};

export type ChargeResult = {
  provider: string;
  providerId: string;
  status: "pending";
  boletoUrl?: string;
  pixCode?: string;
};

export interface PspProvider {
  readonly name: string;
  createCharge(req: ChargeRequest): Promise<ChargeResult>;
}

/**
 * Provider stub (determinístico) — usado quando não há PSP real configurado.
 * Gera URLs/códigos fictícios para desenvolvimento e testes.
 */
export const stubPsp: PspProvider = {
  name: "stub",
  async createCharge(req) {
    const providerId = `stub_${req.reference}_${req.method}`;
    return {
      provider: "stub",
      providerId,
      status: "pending",
      boletoUrl: req.method === "boleto" ? `https://psp.local/boleto/${providerId}.pdf` : undefined,
      pixCode: req.method === "pix" ? `00020126PIX-${providerId}-${req.amount}` : undefined,
    };
  },
};

/**
 * Provider Asaas (esqueleto) — chama a API real quando ASAAS_API_KEY está configurada.
 * Mapeia o lançamento a uma cobrança BOLETO/PIX. Mantido enxuto: ao plugar de verdade,
 * é preciso garantir/cadastrar o customer no Asaas e tratar paginação/erros.
 */
export function asaasPsp(apiKey: string): PspProvider {
  const base = "https://api.asaas.com/v3";
  return {
    name: "asaas",
    async createCharge(req) {
      const res = await fetch(`${base}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", access_token: apiKey },
        body: JSON.stringify({
          billingType: req.method === "boleto" ? "BOLETO" : "PIX",
          value: Number(req.amount),
          dueDate: req.dueDate,
          description: `Cobrança ${req.reference}`,
          externalReference: req.reference,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`Asaas ${res.status}`);
      const json = (await res.json()) as { id: string; bankSlipUrl?: string; invoiceUrl?: string };
      let pixCode: string | undefined;
      if (req.method === "pix") {
        const pix = await fetch(`${base}/payments/${json.id}/pixQrCode`, { headers: { access_token: apiKey } });
        if (pix.ok) pixCode = ((await pix.json()) as { payload?: string }).payload;
      }
      return {
        provider: "asaas",
        providerId: json.id,
        status: "pending",
        boletoUrl: req.method === "boleto" ? (json.bankSlipUrl ?? json.invoiceUrl) : undefined,
        pixCode,
      };
    },
  };
}

/** Seleciona o PSP: Asaas se a chave existir, senão o stub. */
export function resolvePsp(env: Env): PspProvider {
  if (env.ASAAS_API_KEY) return asaasPsp(env.ASAAS_API_KEY);
  return stubPsp;
}
