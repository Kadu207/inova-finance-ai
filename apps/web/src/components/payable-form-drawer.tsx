"use client";

import { useState } from "react";
import { getClientSession } from "@/lib/auth.client";
import { createPayable } from "@/lib/finance-api";

type PayableFormDrawerProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
};

const PAYMENT_METHODS = ["PIX", "Boleto", "Transferência"] as const;

export function PayableFormDrawer({ open, onClose, onCreated }: PayableFormDrawerProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState({
    vendor: "",
    cnpj: "",
    description: "",
    amount: "",
    dueDate: "",
    costCenter: "",
    paymentMethod: "PIX" as (typeof PAYMENT_METHODS)[number],
    notes: "",
  });

  if (!open) return null;

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleClose() {
    setStep(1);
    setSubmitError(null);
    onClose();
  }

  async function handleSubmit() {
    const token = getClientSession();
    if (!token) {
      setSubmitError("Sessão expirada. Faça login novamente.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const supplierName = form.description ? `${form.vendor} — ${form.description}` : form.vendor;
      await createPayable(token, {
        supplierName,
        amount: form.amount,
        dueDate: form.dueDate,
        branchId: "branch_main",
      });
      onCreated?.();
      handleClose();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Erro ao salvar lançamento");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="ina-drawer-overlay" onClick={handleClose} aria-hidden />
      <aside className="ina-drawer" role="dialog" aria-labelledby="payable-drawer-title">
        <div className="ina-drawer__header">
          <h2 id="payable-drawer-title" style={{ margin: 0, fontSize: "1.125rem" }}>
            Novo lançamento — AP
          </h2>
          <button type="button" className="ina-btn ina-btn--ghost" onClick={handleClose} aria-label="Fechar">
            ✕
          </button>
        </div>

        <div className="ina-drawer__body">
          {submitError && (
            <p className="ina-badge ina-badge--danger" style={{ marginBottom: "1rem" }}>
              {submitError}
            </p>
          )}
          <div className="ina-steps">
            <div className={`ina-step${step >= 1 ? " ina-step--active" : ""}${step > 1 ? " ina-step--done" : ""}`} />
            <div className={`ina-step${step >= 2 ? " ina-step--active" : ""}`} />
          </div>

          {step === 1 && (
            <>
              <div className="ina-field">
                <label className="ina-label" htmlFor="vendor">Fornecedor *</label>
                <input id="vendor" className="ina-input" value={form.vendor} onChange={(e) => update("vendor", e.target.value)} required />
              </div>
              <div className="ina-field">
                <label className="ina-label" htmlFor="cnpj">CNPJ</label>
                <input id="cnpj" className="ina-input" value={form.cnpj} onChange={(e) => update("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
              </div>
              <div className="ina-field">
                <label className="ina-label" htmlFor="description">Descrição *</label>
                <input id="description" className="ina-input" value={form.description} onChange={(e) => update("description", e.target.value)} required />
              </div>
              <div className="ina-field">
                <label className="ina-label" htmlFor="amount">Valor (R$) *</label>
                <input id="amount" className="ina-input" type="number" step="0.01" value={form.amount} onChange={(e) => update("amount", e.target.value)} required />
              </div>
              <div className="ina-field">
                <label className="ina-label" htmlFor="dueDate">Vencimento *</label>
                <input id="dueDate" className="ina-input" type="date" value={form.dueDate} onChange={(e) => update("dueDate", e.target.value)} required />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="ina-field">
                <label className="ina-label" htmlFor="costCenter">Centro de custo</label>
                <input id="costCenter" className="ina-input" value={form.costCenter} onChange={(e) => update("costCenter", e.target.value)} />
              </div>
              <div className="ina-field">
                <label className="ina-label" htmlFor="paymentMethod">Forma de pagamento</label>
                <select id="paymentMethod" className="ina-input" value={form.paymentMethod} onChange={(e) => update("paymentMethod", e.target.value)}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="ina-field">
                <label className="ina-label" htmlFor="attachment">Anexo (OCR futuro)</label>
                <input id="attachment" className="ina-input" type="file" accept=".pdf,.png,.jpg" disabled title="Disponível após integração OCR" />
              </div>
              <div className="ina-field">
                <label className="ina-label" htmlFor="notes">Observações</label>
                <textarea id="notes" className="ina-input" rows={3} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
              </div>
              <div className="ina-card" style={{ marginTop: "1rem" }}>
                <div className="ina-card__body" style={{ fontSize: "0.875rem" }}>
                  <strong>Revisão</strong>
                  <p style={{ margin: "0.5rem 0 0", color: "var(--color-text-muted)" }}>
                    {form.vendor || "—"} · R$ {form.amount || "0,00"} · venc. {form.dueDate || "—"}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="ina-drawer__footer">
          {step === 2 && (
            <button type="button" className="ina-btn ina-btn--ghost" onClick={() => setStep(1)} disabled={submitting}>
              Voltar
            </button>
          )}
          {step === 1 ? (
            <button
              type="button"
              className="ina-btn ina-btn--primary"
              onClick={() => setStep(2)}
              disabled={!form.vendor || !form.description || !form.amount || !form.dueDate}
            >
              Continuar
            </button>
          ) : (
            <button type="button" className="ina-btn ina-btn--primary" onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting ? "Salvando..." : "Confirmar lançamento"}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
