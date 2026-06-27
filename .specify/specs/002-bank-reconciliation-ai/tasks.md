---
description: "Task list — Conciliação Bancária com Assistente de IA"
---

# Tasks: Conciliação Bancária com Assistente de IA

**Input**: `.specify/specs/002-bank-reconciliation-ai/{spec.md, plan.md}`

**Tests**: incluídos (a Constitution exige TDD + teste de isolamento cross-tenant).

**Organization**: agrupadas por user story (US1–US4 da spec), cada uma entregável de forma independente.

## Format: `[ID] [P?] [Story] Descrição`

- **[P]**: paralelizável (arquivos diferentes, sem dependência)

## Phase 1: Setup

- [ ] T001 Criar contratos em `contracts/openapi-reconciliation.yaml` e `contracts/events-reconciliation.json`
- [ ] T002 Criar `data-model.md` (BankTransaction, ReconciliationMatch, ReconciliationSession)

## Phase 2: Foundational (BLOQUEIA todas as stories)

- [ ] T003 Adicionar models `BankTransaction`, `ReconciliationMatch`, `ReconciliationSession` em `packages/db/prisma/schema.prisma` (com `tenantId`, índices `@@index([tenantId, ...])`, `@@unique([tenantId, fitid])` para idempotência)
- [ ] T004 Acrescentar as 3 tabelas à lista `protected_tables` em `packages/db/prisma/rls.sql` + migration de RLS
- [ ] T005 [P] Schema Zod `ReconciliationCompleted` em `packages/events/src/index.ts` (+ registrar em `eventSchemas`)
- [ ] T006 [P] `reconciliation-store.ts` com esqueleto das queries via `withTenantScope` (`workers/app-api/src/db/`)
- [ ] T007 Registrar `/api/finance/reconciliation` e `/api/finance/assistant` em `workers/app-api/src/app.ts` (sob `requireTenantContext` + finance middleware)

**Checkpoint**: schema + RLS + eventos + roteamento prontos.

## Phase 3: User Story 1 — Importar OFX + conciliação automática (P1) 🎯 MVP

**Goal**: importar extrato e casar lançamentos automaticamente.

**Independent Test**: subir OFX de 10 lançamentos; matched/unmatched corretos; nenhum dado de outro tenant tocado.

### Tests (escrever primeiro, devem FALHAR)

- [ ] T008 [P] [US1] Contract test de `POST /api/finance/reconciliation/import` (`workers/app-api/src/routes/reconciliation.test.ts`)
- [ ] T009 [P] [US1] Teste de integração `app.fetch`: import + auto-match baixa o `Payable` correspondente
- [ ] T010 [US1] Teste de **isolamento**: token tenant B + header tenant A → não concilia/não vê dados de A (FALHA se vazar)

### Implementação

- [ ] T011 [US1] Parser OFX → `BankTransaction[]` (edge; lib JS) em `reconciliation-store.ts`
- [ ] T012 [US1] `importStatement(db, tenantId, bankAccountId, ofx, idempotencyKey)`: idempotente por FITID, persiste via `withTenantScope`
- [ ] T013 [US1] Regra de auto-match (valor + janela de data + filial) → cria `ReconciliationMatch (origin=auto)`, baixa título (`paid`)
- [ ] T014 [US1] `POST /api/finance/reconciliation/import` em `routes/reconciliation.ts` (RBAC `finance:write`)
- [ ] T015 [US1] Emitir `ReconciliationCompleted` via `EVENTS_QUEUE` com `tenantId/correlationId/idempotencyKey`
- [ ] T016 [US1] AuditLog em cada baixa (depende da feature AuditLog/LGPD)

**Checkpoint**: US1 funcional e testável sozinha (MVP).

## Phase 4: User Story 2 — Revisão/ajuste manual (P2)

**Goal**: confirmar/rejeitar/casar manualmente.

**Independent Test**: confirmar 1 par sugerido; casar 1 unmatched manualmente; refletir sem reload.

### Tests

- [ ] T017 [P] [US2] Contract tests de `POST /reconciliation/matches/:id/confirm|reject` e `POST /reconciliation/matches` (manual)

### Implementação

- [ ] T018 [US2] `confirmMatch`/`rejectMatch`/`createManualMatch` em `reconciliation-store.ts` (via `withTenantScope`)
- [ ] T019 [US2] Rotas de confirm/reject/manual em `routes/reconciliation.ts`; baixa/estorna título + AuditLog
- [ ] T020 [P] [US2] UI `apps/web/src/components/reconciliation-client.tsx` + página `/reconciliation` (guard `getSession`)

**Checkpoint**: US1 + US2 independentes.

## Phase 5: User Story 3 — Assistente de IA conversacional (P2)

**Goal**: perguntas financeiras em linguagem natural escopadas por tenant.

**Independent Test**: "qual meu saldo?" → valor real do cash-flow do tenant do JWT; sem vazar outro tenant.

### Tests

- [ ] T021 [P] [US3] Teste: agente chama tool `finance:read` escopada ao tenant do JWT e responde o `cash-flow` correto
- [ ] T022 [US3] Teste: pergunta fora de escopo → recusa sem inventar números

### Implementação

- [ ] T023 [US3] No `workers/agents-runtime`: tools reais (`finance:read` → chama `app-api`) + chamada LLM (OpenRouter) com prompt pt-BR e guarda de RBAC
- [ ] T024 [US3] `POST /api/finance/assistant` em `routes/assistant.ts` (deriva tenant do JWT; encaminha ao agente)
- [ ] T025 [US3] Fallback determinístico quando `OPENROUTER_API_KEY` ausente/LLM fora (sem 500 opaco)
- [ ] T026 [P] [US3] UI `assistant-panel.tsx` (chat) + integração no Chatwoot (mapeia `conversation_id ↔ tenant`)

**Checkpoint**: US1–US3 independentes.

## Phase 6: User Story 4 — IA sugere matches com confiança (P3)

**Goal**: para lançamentos ambíguos, IA propõe par + `confidence` + `reason`.

### Tests

- [ ] T027 [P] [US4] Teste: múltiplos candidatos → sugestão com `confidence` e `reason`; `confidence < limiar` permanece `suggested`

### Implementação

- [ ] T028 [US4] No auto-match, quando há ambiguidade, chamar o agente para ranquear candidatos (retorna `confidence`/`reason`)
- [ ] T029 [US4] Persistir `ReconciliationMatch (origin=ai, status=suggested)`; nunca `confirmed` automático abaixo do limiar (configurável por tenant)

**Checkpoint**: todas as stories funcionais.

## Phase 7: Polish & Cross-Cutting

- [ ] T030 [P] Atualizar `docs/` (fluxo de conciliação + assistente) e `README`
- [ ] T031 Contract tests no CI (`pnpm test:contract`) verdes
- [ ] T032 Validar SC-001..005 da spec com dados de teste; medir P95
- [ ] T033 Segurança: revisar RLS nas novas tabelas + rota assistant não vaza cross-tenant

## Dependencies & Execution Order

- **Setup (P1)** → **Foundational (P2, BLOQUEIA)** → **US1 (P1, MVP)** → US2/US3 (paralelizáveis) → US4 → Polish.
- US4 depende de US1 (matches) + US3 (agente). US2 e US3 independem entre si.
- Dentro de cada story: testes (devem falhar) → store → rotas → UI.

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- Toda query de banco passa por `withTenantScope` (RLS); todo evento por Outbox com idempotência.
- Commit por task ou grupo lógico; parar nos checkpoints para validar a story isolada.
