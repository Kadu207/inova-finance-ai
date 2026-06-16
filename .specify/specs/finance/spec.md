# Spec: Financeiro — AP, AR, Caixa, Conciliação, PIX, Tesouraria, Agenda

**Feature ID:** `finance-mvp`  
**Status:** Approved  
**Agent:** 03 Specify Finance

## User Stories

### US-F01 — Contas a Pagar

CRUD títulos AP com vencimento, fornecedor, centro de custo, status (`open`, `paid`, `cancelled`).

### US-F02 — Contas a Receber

CRUD títulos AR com cliente, vencimento, status, link cobrança.

### US-F03 — Fluxo de Caixa

Visão consolidada entradas/saídas por período e filial.

### US-F04 — Conciliação

Match extrato ↔ lançamentos com lock otimista.

### US-F05 — Agenda Financeira

Calendário de vencimentos e compromissos; alertas via eventos `FinanceDueReminder`.

### US-F06 — PIX / Tesouraria

Registro de movimentações PIX; saldo tesouraria por conta bancária.

## Invariantes Financeiros

- Soma AP aberto + AR aberto reconcilia com ledger
- Writes financeiros exigem `idempotency_key`
- Eventos: `PayableCreated`, `ReceivableCreated`, `PaymentRecorded`, `ReconciliationMatched`

## Contratos

Ver `contracts/openapi-finance.yaml`
