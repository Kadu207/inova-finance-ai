"use client";

import { useState } from "react";
import { INA_PORTS } from "@inova/config";

type Conversation = {
  id: number;
  customer: string;
  preview: string;
  channel: string;
  unread: boolean;
  linkedAr?: string;
};

type Message = {
  id: number;
  content: string;
  incoming: boolean;
  at: string;
};

const CONVERSATIONS: Conversation[] = [
  { id: 1, customer: "Cliente Beta S.A.", preview: "Boleto vence amanhã, posso parcelar?", channel: "WhatsApp", unread: true, linkedAr: "AR-2026-0142" },
  { id: 2, customer: "Distribuidora Gamma", preview: "Comprovante PIX enviado", channel: "WhatsApp", unread: false },
  { id: 3, customer: "Tech Solutions", preview: "Preciso da segunda via da NF", channel: "Telegram", unread: true },
];

const MESSAGES: Record<number, Message[]> = {
  1: [
    { id: 1, content: "Olá, meu boleto vence amanhã. Posso parcelar em 3x?", incoming: true, at: "10:32" },
    { id: 2, content: "Olá! Vou verificar sua situação no ERP e retorno em instantes.", incoming: false, at: "10:35" },
  ],
  2: [
    { id: 1, content: "Segue comprovante do PIX de R$ 18.750,00", incoming: true, at: "09:15" },
  ],
  3: [
    { id: 1, content: "Bom dia, preciso da segunda via da nota fiscal 4521.", incoming: true, at: "08:50" },
  ],
};

const CHATWOOT_URL = process.env.NEXT_PUBLIC_CHATWOOT_URL ?? `http://localhost:${INA_PORTS.chatwoot}`;

export function ChatwootPanel() {
  const [activeId, setActiveId] = useState(1);
  const [reply, setReply] = useState("");
  const messages = MESSAGES[activeId] ?? [];
  const active = CONVERSATIONS.find((c) => c.id === activeId);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.75rem" }}>
        <a href={CHATWOOT_URL} target="_blank" rel="noopener noreferrer" className="ina-btn ina-btn--ghost">
          Abrir no Chatwoot ↗
        </a>
      </div>

      <div className="ina-support-layout">
        <div className="ina-conv-list" role="list">
          {CONVERSATIONS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="listitem"
              className={`ina-conv-item${c.id === activeId ? " ina-conv-item--active" : ""}`}
              onClick={() => setActiveId(c.id)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: "0.875rem" }}>{c.customer}</strong>
                {c.unread && <span className="ina-badge ina-badge--danger" style={{ fontSize: "0.625rem" }}>Nova</span>}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.25rem" }}>{c.channel}</div>
              <div style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginTop: "0.375rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.preview}
              </div>
              {c.linkedAr && (
                <div style={{ marginTop: "0.375rem" }}>
                  <span className="ina-badge ina-badge--neutral">↔ {c.linkedAr}</span>
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="ina-thread">
          <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--color-border)" }}>
            <strong>{active?.customer}</strong>
            <div style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
              {active?.channel}
              {active?.linkedAr && ` · Vinculado a ${active.linkedAr}`}
            </div>
          </div>
          <div className="ina-thread__messages">
            {messages.map((m) => (
              <div key={m.id} className={`ina-bubble ${m.incoming ? "ina-bubble--in" : "ina-bubble--out"}`}>
                {m.content}
                <div style={{ fontSize: "0.6875rem", opacity: 0.6, marginTop: "0.25rem" }}>{m.at}</div>
              </div>
            ))}
          </div>
          <div className="ina-thread__composer">
            <input
              className="ina-input"
              placeholder="Responder via API Chatwoot…"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="button" className="ina-btn ina-btn--primary" onClick={() => setReply("")}>
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
