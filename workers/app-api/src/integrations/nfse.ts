import type { Env } from "../types";

export type NfseRequest = {
  amount: string;
  serviceDescription: string;
  customerName: string;
  reference: string; // tenantId:invoiceRef
};

export type NfseResult = {
  provider: string;
  providerId: string;
  number?: string;
  status: "issued" | "processing";
  pdfUrl?: string;
  xmlUrl?: string;
};

export interface NfseProvider {
  readonly name: string;
  issue(req: NfseRequest): Promise<NfseResult>;
}

/** Provider stub (determinístico) — emite NFS-e fictícia para dev/testes. */
export const stubNfse: NfseProvider = {
  name: "stub",
  async issue(req) {
    const providerId = `stub_nfse_${req.reference}`;
    return {
      provider: "stub",
      providerId,
      number: `NFSE-${providerId.slice(-8)}`,
      status: "issued",
      pdfUrl: `https://nfse.local/${providerId}.pdf`,
      xmlUrl: `https://nfse.local/${providerId}.xml`,
    };
  },
};

/**
 * Provider PlugNotas (esqueleto). NFS-e municipal é normalmente ASSÍNCRONA: a emissão
 * retorna "processing" e o webhook (/webhooks/nfse) atualiza status/número/URLs.
 * Ao plugar de verdade: certificado digital + cadastro do prestador no provedor.
 */
export function plugnotasNfse(apiKey: string): NfseProvider {
  const base = "https://api.plugnotas.com.br";
  return {
    name: "plugnotas",
    async issue(req) {
      const res = await fetch(`${base}/nfse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({
          servico: { descricao: req.serviceDescription, valor: Number(req.amount) },
          tomador: { razaoSocial: req.customerName },
          idIntegracao: req.reference,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`PlugNotas ${res.status}`);
      const json = (await res.json()) as { id?: string };
      return { provider: "plugnotas", providerId: json.id ?? req.reference, status: "processing" };
    },
  };
}

/** Seleciona o provedor de NFS-e: real se NFSE_API_KEY existir, senão o stub. */
export function resolveNfse(env: Env): NfseProvider {
  if (env.NFSE_API_KEY) return plugnotasNfse(env.NFSE_API_KEY);
  return stubNfse;
}
