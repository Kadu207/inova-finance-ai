# Tasks: Pipeline S2-S3 — Prisma + Frontend + Staging

**Agent 07-09 orchestration** | **Date:** 2026-06-16

## Phase 1: Database (Agent 07)

- [x] T001 Prisma client + seed demo em `workers/app-api/src/db/`
- [x] T002 Hyperdrive local port 5442 em `wrangler.jsonc`
- [x] T003 Migration inicial PostgreSQL
- [ ] T004 RLS policies production (VPS deploy)

## Phase 2: App API (Agent 08)

- [x] T010 Finance store Prisma `db/finance-store.ts`
- [x] T011 Auth store Prisma `db/auth-store.ts`
- [ ] T012 AuditLog em POST payables/receivables
- [ ] T013 Hyperdrive adapter Worker production

## Phase 3: Web (Agent 09)

- [x] T020 API client com headers tenant
- [x] T021 Payables list + create via API
- [x] T022 Receivables list via API
- [x] T023 Dashboard KPIs from cash-flow/agenda
- [ ] T024 Receivable create form

## Phase 4: DevOps (Agent 06)

- [x] T030 `scripts/dev-local.sh` start/stop/status
- [x] T031 Spec Kit bash scripts Linux
- [x] T032 Agent registry `.specify/agents/registry.yml`
- [ ] T033 Staging Hyperdrive IDs (secrets CF)
- [ ] T034 VPS deploy + DNS

## Phase 5: Quality (Agents 24-25)

- [x] T040 Vitest monorepo green
- [x] T041 Playwright dependency + smoke
- [ ] T042 OpenAPI contract test runner
- [ ] T043 Revalidation 26-40 re-run pós-staging

## Phase 6: Agents 12-23 + 41-55

- [x] T050 Business agents scaffold (12)
- [x] T051 Embedded agents cron (41-55)
- [ ] T052 OpenRouter integration agents-runtime
- [ ] T053 Agent orchestrator calls biz agents
