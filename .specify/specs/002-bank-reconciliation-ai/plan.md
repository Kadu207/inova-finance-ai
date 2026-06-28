# Implementation Plan: Conciliação Bancária com Assistente de IA

**Branch**: `002-bank-reconciliation-ai` | **Date**: 2026-06-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `.specify/specs/002-bank-reconciliation-ai/spec.md`

## Summary

Importar extrato bancário (OFX no MVP, Open Finance depois), conciliar automaticamente os lançamentos contra `Payable`/`Receivable`/`CashMovement` abertos por regra determinística (valor + janela de data + filial), permitir revisão/ajuste manual, e expor um assistente de IA conversacional que responde perguntas financeiras (escopado por tenant) e sugere conciliações ambíguas com confiança. Reaproveita o `app-api` (rotas), o `agents-runtime` (LLM) e o Outbox/Messaging (eventos), respeitando o tenant do JWT (C1) + RLS (defense-in-depth).

## Technical Context

**Language/Version**: TypeScript 5.7 (Workers + Next.js 15), Python 3.12 (VPS, se OFX pesado).

**Primary Dependencies**: Hono (app-api), Prisma 6 + `@prisma/adapter-pg` (Postgres via Hyperdrive), Zod (`@inova/events`), Cloudflare Agents/Durable Objects (`agents-runtime`), OpenRouter (LLM, agente 53). Parser OFX: lib JS (ex. `ofx-js`) ou FastAPI no VPS para arquivos grandes.

**Storage**: PostgreSQL (Hetzner via Hyperdrive). Novas tabelas: `BankTransaction`, `ReconciliationMatch`, `ReconciliationSession` (todas com `tenantId`, sob RLS).

**Testing**: Vitest (Workers, incl. `app.fetch` + teste de isolamento cross-tenant obrigatório), contract tests (OpenAPI/JSON Schema), Pytest (se serviço VPS).

**Target Platform**: Cloudflare Workers (edge) + Next.js; LLM via OpenRouter.

**Project Type**: Web app multitenant (frontend Next.js + backend Workers/edge + VPS opcional).

**Performance Goals**: Importar+conciliar 100 lançamentos < 5 s (P95); assistente responde saldo < 3 s.

**Constraints**: Isolamento multitenant NON-NEGOTIABLE (tenant do JWT + RLS); idempotência por `X-Idempotency-Key`/FITID; eventos via Outbox; sem alucinação numérica do assistente.

**Scale/Scope**: MVP — OFX 1:1, assistente read-only sobre AP/AR/caixa. Fora: pagamentos parciais/agrupados, Open Finance, BI.

## Constitution Check

*GATE: passa antes do Phase 0; re-checar após design.*

| Princípio | Como o plano atende |
|-----------|---------------------|
| I. Isolamento multitenant (NON-NEGOTIABLE) | tenant do JWT (C1) em todas as rotas; novas tabelas com `tenantId` + RLS via `withTenantScope`; teste de cross-tenant que FALHA se vazar |
| II. SDD | spec → este plan → tasks → implement → validate; contratos antes de implementar |
| III. TDD | testes de rota/contrato/isolamento antes da implementação |
| IV. Event-driven | `ReconciliationCompleted` via Outbox/Messaging com idempotência/correlação |
| V. Híbrida | edge (Workers) para auth/conciliação determinística; VPS (FastAPI) só se OFX/volume exigir |
| VI. Segurança & LGPD | RBAC `finance:read`/`finance:write`; assistente só lê o tenant do JWT; export/delete (feature AuditLog/LGPD) cobre os novos dados |
| VII. YAGNI | OFX 1:1 no MVP; Open Finance e IA de sugestão são incrementos (US4) |

**Resultado**: PASS. Nenhuma violação a justificar.

## Project Structure

### Documentation (this feature)

```text
.specify/specs/002-bank-reconciliation-ai/
├── spec.md              # feito
├── plan.md              # este arquivo
├── tasks.md             # próximo
├── data-model.md        # a criar (entidades BankTransaction/ReconciliationMatch/Session)
└── contracts/
    ├── openapi-reconciliation.yaml   # rotas /api/finance/reconciliation/*
    └── events-reconciliation.json    # schema ReconciliationCompleted
```

### Source Code (repository root)

```text
packages/db/prisma/schema.prisma            # + BankTransaction, ReconciliationMatch, ReconciliationSession
packages/db/prisma/rls.sql                  # + policies tenant_isolation nas novas tabelas
packages/events/src/index.ts                # + ReconciliationCompleted (Zod)

workers/app-api/src/routes/reconciliation.ts  # NOVO: import OFX, list, confirm/reject/match manual
workers/app-api/src/db/reconciliation-store.ts # NOVO: queries via withTenantScope
workers/app-api/src/app.ts                    # registra /api/finance/reconciliation
workers/app-api/src/routes/assistant.ts       # NOVO: /api/finance/assistant (chama agents-runtime)

workers/agents-runtime/src/index.ts           # agente cfo/financeiro: tools finance:read reais + LLM

apps/web/src/app/reconciliation/page.tsx       # NOVO: tela de conciliação (guard getSession)
apps/web/src/components/reconciliation-client.tsx
apps/web/src/components/assistant-panel.tsx    # chat do assistente

services/ocr/ ou services/reporting/           # parser OFX se volume exigir (opcional)
```

**Structure Decision**: estende o monorepo existente — backend no `app-api` (rotas + store via `withTenantScope`), IA no `agents-runtime`, eventos no `@inova/events`, UI no `apps/web`. OFX parseado no edge para o MVP; VPS só se necessário.

## Complexity Tracking

> Sem violações da Constitution. Único ponto de atenção: o assistente de IA exige LLM real (hoje stub) — tratar como dependência (OpenRouter) com fallback determinístico, não como nova complexidade arquitetural.
