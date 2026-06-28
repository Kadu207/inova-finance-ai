# Feature Specification: Conciliação Bancária com Assistente de IA

**Feature Branch**: `002-bank-reconciliation-ai`

**Created**: 2026-06-27

**Status**: Draft

**Input**: User description: "conciliação bancária com assistente de IA — paridade competitiva com Controlle (importação de extrato OFX/Open Finance, conciliação automática contra AP/AR/caixa) somada a um assistente de IA conversacional que responde perguntas financeiras e sugere conciliações."

## Contexto e alinhamento

Fecha a maior lacuna competitiva frente ao [Controlle](https://controlle.com): conciliação bancária. Reaproveita entidades já modeladas (`BankAccount`, `CashMovement`, `Payable`, `Receivable` em `packages/db/prisma/schema.prisma`), o runtime de agentes (`workers/agents-runtime`, agente `cfo`/`financeiro`) e o barramento de eventos (`packages/events`). Respeita a Constitution: **isolamento multitenant** (tenant derivado do JWT, ver [[tenant-isolation-vuln]]/C1), **event-driven** com Outbox, **TDD** e **pt-BR**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Importar extrato e conciliar automaticamente (Priority: P1)

Como **analista financeiro**, quero importar o extrato bancário (arquivo OFX) e ver o sistema casar automaticamente cada lançamento do extrato com um título a pagar/receber ou movimento de caixa correspondente, para não conferir lançamento a lançamento manualmente.

**Why this priority**: É o núcleo do valor — sem conciliação automática o módulo não existe e a paridade com o Controlle não acontece. É a fatia mínima que já entrega valor (mesmo só com OFX, sem Open Finance).

**Independent Test**: Subir um OFX de teste com 10 lançamentos via `POST /api/finance/reconciliation/import`; verificar que os que têm valor+data compatíveis com títulos abertos do tenant aparecem como `matched` e os demais como `unmatched`, sem nenhum lançamento de outro tenant sendo tocado.

**Acceptance Scenarios**:

1. **Given** usuário com `finance:write` e uma conta bancária do tenant, **When** envia um OFX válido, **Then** cada lançamento vira um `BankTransaction` escopado ao tenant e ganha status `matched`/`unmatched`.
2. **Given** um lançamento de débito de R$ 1.500,00 em 10/07 e um `Payable` aberto de R$ 1.500,00 vencendo em 10/07 (mesma filial), **When** a conciliação roda, **Then** os dois são vinculados (`ReconciliationMatch`) e o `Payable` é marcado `paid`.
3. **Given** a importação concluída, **When** termina, **Then** um evento `ReconciliationCompleted` é publicado via Outbox com `tenantId`, `correlationId`, `idempotencyKey`.
4. **Given** o mesmo OFX reenviado (mesma `X-Idempotency-Key`), **When** importado de novo, **Then** nenhum lançamento é duplicado.

---

### User Story 2 — Revisar e ajustar conciliações sugeridas (Priority: P2)

Como **analista financeiro**, quero revisar os pares sugeridos, confirmar, rejeitar ou casar manualmente lançamentos não conciliados, para corrigir o que a automação errou antes de fechar o período.

**Why this priority**: Conciliação automática nunca é 100%; sem revisão humana o saldo conciliado não é confiável. Depende da US1.

**Independent Test**: Em uma conciliação com 1 par sugerido e 1 lançamento `unmatched`, confirmar o par (vira `confirmed`), rejeitar e refazer manualmente o outro contra um título escolhido — a tela reflete sem recarregar.

**Acceptance Scenarios**:

1. **Given** um `ReconciliationMatch` com status `suggested`, **When** o usuário confirma, **Then** vira `confirmed` e o título correspondente é baixado.
2. **Given** um lançamento `unmatched`, **When** o usuário o casa manualmente com um `Receivable` aberto, **Then** cria-se um `ReconciliationMatch` `confirmed` (origem `manual`).
3. **Given** um par `confirmed` por engano, **When** o usuário desfaz, **Then** o vínculo é removido e o título volta a `open`, registrado em `AuditLog`.

---

### User Story 3 — Assistente de IA conversacional para finanças (Priority: P2)

Como **gestor**, quero perguntar em linguagem natural (texto/WhatsApp via Chatwoot) coisas como "qual meu saldo?", "quanto tenho a receber esta semana?" ou "quem está inadimplente?", para obter respostas imediatas sem navegar relatórios.

**Why this priority**: É o diferencial onde o Inova pode liderar (arquitetura de agentes + Chatwoot). Independe da conciliação — entrega valor sozinho consultando AP/AR/caixa.

**Independent Test**: Enviar "qual meu saldo líquido?" ao endpoint do agente `cfo`; verificar que ele chama a tool `finance:read` escopada ao tenant do JWT e responde com o valor real do `cash-flow`, sem vazar dados de outro tenant.

**Acceptance Scenarios**:

1. **Given** usuário autenticado, **When** pergunta "quanto tenho a pagar em aberto?", **Then** o agente consulta apenas o tenant do JWT e responde o total correto em pt-BR.
2. **Given** uma pergunta fora de escopo financeiro, **When** enviada, **Then** o agente recusa educadamente sem inventar dados (sem alucinação de números).
3. **Given** a mesma conversa no Chatwoot, **When** a mensagem chega via webhook, **Then** o `conversation_id` é mapeado ao tenant e a resposta volta pelo mesmo canal.

---

### User Story 4 — IA sugere conciliações com confiança e explicação (Priority: P3)

Como **analista financeiro**, quero que, para lançamentos ambíguos (vários títulos possíveis), a IA proponha o par mais provável com um score de confiança e uma justificativa curta, para decidir mais rápido.

**Why this priority**: Refina a US1/US2 com IA, mas a conciliação por regras determinísticas já entrega o essencial; isto é incremento. Depende de US1 e US3.

**Independent Test**: Para um débito que casa em valor com 3 fornecedores, verificar que a sugestão da IA traz `confidence` (0–1) e um `reason` textual, e que confiança < limiar não baixa o título automaticamente.

**Acceptance Scenarios**:

1. **Given** um lançamento com múltiplos candidatos, **When** a IA avalia, **Then** retorna o candidato com maior `confidence` e uma justificativa.
2. **Given** `confidence` abaixo do limiar configurável, **When** sugerido, **Then** fica como `suggested` (nunca `confirmed` automático).

### Edge Cases

- Extrato OFX malformado/encoding inválido → rejeita com erro em pt-BR, nada é persistido.
- Lançamento sem candidato (valor/data sem correspondência) → `unmatched`, disponível para casamento manual.
- Um lançamento que casa parcialmente (pagamento parcial de um título) → fora de escopo do MVP (marcar `unmatched` + nota).
- Conta bancária inexistente ou de outro tenant no header → 403/404, jamais concilia cross-tenant.
- Duplicidade de extrato (mesmo FITID/ID OFX) → ignorada por idempotência.
- Assistente de IA sem `OPENROUTER_API_KEY` ou LLM fora → degrada para resposta determinística (consulta direta) ou mensagem de indisponibilidade, sem 500 opaco.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema MUST aceitar upload de extrato **OFX** por conta bancária do tenant e persistir cada lançamento como `BankTransaction` escopado a `tenantId` (derivado do JWT, nunca só do header).
- **FR-002**: Sistema MUST conciliar automaticamente por regra determinística (valor exato + janela de data + filial) `BankTransaction` ↔ `Payable`/`Receivable`/`CashMovement` abertos.
- **FR-003**: Sistema MUST registrar cada vínculo como `ReconciliationMatch` com `origin` (`auto`|`ai`|`manual`) e `status` (`suggested`|`confirmed`|`rejected`).
- **FR-004**: Ao confirmar um match de pagamento/recebimento, Sistema MUST baixar o título (`paid`) e registrar em `AuditLog`.
- **FR-005**: Sistema MUST publicar `ReconciliationCompleted` via Outbox/Messaging com `tenantId`, `correlationId`, `idempotencyKey` (schema novo em `packages/events`).
- **FR-006**: Importação MUST ser idempotente por `X-Idempotency-Key` e por identificador do lançamento (FITID OFX).
- **FR-007**: Usuários MUST poder confirmar, rejeitar e criar manualmente matches via API/UI.
- **FR-008**: Assistente de IA MUST responder perguntas financeiras consultando **somente** o tenant do JWT, via tools com RBAC (`finance:read`), reaproveitando `workers/agents-runtime` (agentes `cfo`/`financeiro`).
- **FR-009**: Assistente MUST nunca inventar valores: respostas numéricas vêm de consultas reais; sem dado → declara que não sabe.
- **FR-010**: Para lançamentos ambíguos, Sistema MUST poder solicitar à IA uma sugestão com `confidence` e `reason`; confiança abaixo do limiar MUST permanecer `suggested`.
- **FR-011**: Toda operação MUST exigir headers `X-Tenant-Id`, `X-Branch-Id`, `X-Correlation-Id` e respeitar `finance:read`/`finance:write`.
- **FR-012**: Integração **Open Finance** (leitura automática de extrato via instituição autorizada) é desejável, mas MAY ficar para fase posterior (OFX cobre o MVP). [NEEDS CLARIFICATION: provedor/agregador Open Finance a usar]

### Key Entities *(include if feature involves data)*

- **BankTransaction**: lançamento do extrato (data, valor `Decimal(18,2)`, tipo débito/crédito, descrição, FITID, `bankAccountId`, `tenantId`, status `matched`/`unmatched`).
- **ReconciliationMatch**: vínculo entre um `BankTransaction` e um recurso (`Payable`/`Receivable`/`CashMovement`); atributos `origin`, `status`, `confidence?`, `reason?`, `actorId`, `tenantId`.
- **ReconciliationSession**: agrupa uma importação (arquivo, conta, contadores matched/unmatched, `correlationId`), para auditoria e reprocessamento.
- **AssistantQuery** (efêmero/log): pergunta do usuário, tools chamadas, resposta, `tenantId`, `conversationId?` (Chatwoot) — para observabilidade e LGPD.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em um extrato de teste representativo, ≥ 80% dos lançamentos com título correspondente são conciliados automaticamente sem intervenção.
- **SC-002**: Zero conciliações cross-tenant em testes (teste de isolamento obrigatório que FALHA se vazar).
- **SC-003**: Importar e conciliar um extrato de 100 lançamentos em < 5 s (P95) no edge.
- **SC-004**: O assistente responde "qual meu saldo?" com o valor exato do `cash-flow` em < 3 s e sem alucinação numérica em 100% dos casos de teste.
- **SC-005**: Reduzir o tempo de fechamento de conciliação mensal percebido (baseline a medir com PO).

## Assumptions

- OFX é o formato de entrada do MVP; Open Finance fica para fase posterior (depende de provedor/credenciamento BC).
- Reutiliza-se autenticação/RBAC e o tenant derivado do JWT já implementados (C1); nada de novo em auth.
- O LLM do assistente roteia por `OPENROUTER_API_KEY` (agente 53), com fallback determinístico quando indisponível.
- Conciliação 1:1 (um lançamento ↔ um título) no MVP; pagamentos parciais/agrupados ficam fora.
- Persistência depende do Postgres via Hyperdrive já habilitado (C2).
- Spec sujeita às fases Spec Kit: → `plan.md` → `tasks.md` → implementação TDD → validação (contract tests + teste de isolamento).
