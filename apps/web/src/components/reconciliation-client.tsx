"use client";

import { useCallback, useEffect, useState } from "react";
import {
  importOfx,
  fetchBankTransactions,
  rejectReconMatch,
  confirmReconMatch,
  suggestReconMatches,
  createReconManualMatch,
  fetchPayables,
  fetchReceivables,
  formatBRL,
  formatDateBR,
  type BankTxn,
  type ApiPayable,
  type ApiReceivable,
  type ReconImportResult,
} from "@/lib/finance-api";

export function ReconciliationClient() {
  const [ofx, setOfx] = useState("");
  const [bankAccountId, setBankAccountId] = useState("ba_main");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ReconImportResult | null>(null);
  const [txns, setTxns] = useState<BankTxn[]>([]);
  const [openPayables, setOpenPayables] = useState<ApiPayable[]>([]);
  const [openReceivables, setOpenReceivables] = useState<ApiReceivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [t, p, r] = await Promise.all([fetchBankTransactions(), fetchPayables(), fetchReceivables()]);
      setTxns(t);
      setOpenPayables(p.filter((x) => x.status === "open"));
      setOpenReceivables(r.filter((x) => x.status === "open"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar conciliação");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleImport() {
    if (!ofx.trim() || !bankAccountId.trim()) return;
    setImporting(true);
    setError(null);
    try {
      const res = await importOfx(bankAccountId, ofx);
      setResult(res);
      setOfx("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao importar OFX");
    } finally {
      setImporting(false);
    }
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setOfx(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function handleReject(matchId: string) {
    setBusy(matchId);
    try {
      await rejectReconMatch(matchId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao estornar");
    } finally {
      setBusy(null);
    }
  }

  async function handleSuggest() {
    setSuggesting(true);
    setError(null);
    try {
      await suggestReconMatches();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao sugerir conciliações");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleConfirm(matchId: string) {
    setBusy(matchId);
    try {
      await confirmReconMatch(matchId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao confirmar");
    } finally {
      setBusy(null);
    }
  }

  async function handleManual(txn: BankTxn, resourceId: string) {
    if (!resourceId) return;
    setBusy(txn.id);
    try {
      await createReconManualMatch(txn.id, txn.type === "debit" ? "payable" : "receivable", resourceId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao casar manualmente");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="ina-card" style={{ marginBottom: "1.5rem" }}>
        <div className="ina-card__header">
          <strong>Importar extrato (OFX)</strong>
        </div>
        <div className="ina-card__body" style={{ display: "grid", gap: "0.75rem", maxWidth: 640 }}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              className="ina-input"
              style={{ maxWidth: 220 }}
              placeholder="Conta bancária"
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
            />
            <input type="file" accept=".ofx,.txt" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
          <textarea
            className="ina-input"
            rows={5}
            placeholder="Cole o conteúdo OFX aqui ou selecione um arquivo…"
            value={ofx}
            onChange={(e) => setOfx(e.target.value)}
          />
          <div>
            <button
              type="button"
              className="ina-btn ina-btn--primary"
              disabled={importing || !ofx.trim()}
              onClick={() => void handleImport()}
            >
              {importing ? "Importando…" : "Importar e conciliar"}
            </button>
          </div>
          {result && (
            <p className="ina-badge ina-badge--success" style={{ display: "inline-block" }}>
              Importados {result.total} lançamento(s): {result.matched} conciliado(s), {result.unmatched} pendente(s).
            </p>
          )}
        </div>
      </div>

      {error && (
        <p className="ina-badge ina-badge--danger" style={{ marginBottom: "1rem", display: "inline-block" }}>
          {error}
        </p>
      )}

      <div className="ina-card">
        <div className="ina-card__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>Lançamentos do extrato</strong>
          <button type="button" className="ina-btn ina-btn--ghost" disabled={suggesting} onClick={() => void handleSuggest()}>
            {suggesting ? "Sugerindo…" : "Sugerir conciliações (IA)"}
          </button>
        </div>
        <div className="ina-card__body" style={{ padding: 0 }}>
          {loading ? (
            <p style={{ padding: "1rem" }}>Carregando…</p>
          ) : txns.length === 0 ? (
            <p style={{ padding: "1rem", color: "var(--color-text-muted)" }}>Nenhum lançamento importado ainda.</p>
          ) : (
            <table className="ina-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th style={{ textAlign: "right" }}>Valor</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {txns.map((t) => {
                  const candidates = t.type === "debit" ? openPayables : openReceivables;
                  return (
                    <tr key={t.id}>
                      <td>{formatDateBR(t.postedAt)}</td>
                      <td>{t.description}</td>
                      <td className="ina-money" style={{ textAlign: "right" }}>
                        {t.type === "debit" ? "-" : "+"}
                        {formatBRL(t.amount)}
                      </td>
                      <td>
                        <span className={`ina-badge ${t.status === "matched" ? "ina-badge--success" : "ina-badge--warning"}`}>
                          {t.status === "matched" ? "Conciliado" : "Pendente"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {t.match && t.match.status === "suggested" ? (
                          <div style={{ display: "flex", gap: "0.25rem", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
                            <span className="ina-badge ina-badge--warning" title={t.match.reason ?? ""}>
                              Sugerido{t.match.confidence != null ? ` ${Math.round(t.match.confidence * 100)}%` : ""}
                            </span>
                            <button type="button" className="ina-btn ina-btn--primary" disabled={busy === t.match.id} onClick={() => void handleConfirm(t.match!.id)}>
                              Confirmar
                            </button>
                            <button type="button" className="ina-btn ina-btn--ghost" disabled={busy === t.match.id} onClick={() => void handleReject(t.match!.id)}>
                              Rejeitar
                            </button>
                          </div>
                        ) : t.status === "matched" && t.match ? (
                          <button
                            type="button"
                            className="ina-btn ina-btn--ghost"
                            disabled={busy === t.match.id}
                            onClick={() => void handleReject(t.match!.id)}
                          >
                            Estornar
                          </button>
                        ) : (
                          <select
                            className="ina-input"
                            style={{ maxWidth: 240 }}
                            defaultValue=""
                            disabled={busy === t.id || candidates.length === 0}
                            onChange={(e) => void handleManual(t, e.target.value)}
                          >
                            <option value="" disabled>
                              {candidates.length ? "Casar com…" : "Sem títulos abertos"}
                            </option>
                            {candidates.map((c) => (
                              <option key={c.id} value={c.id}>
                                {("supplierName" in c ? c.supplierName : c.customerName)} — {formatBRL(c.amount)}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
