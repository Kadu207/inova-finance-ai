# Inova Finance AI Constitution

## Core Principles

### I. Multitenant Isolation (NON-NEGOTIABLE)

Every request MUST carry `X-Tenant-Id`, `X-Branch-Id`, and `X-Correlation-Id`. No database query, cache key, vector search, or event payload may omit tenant context. Cross-tenant data access is forbidden and MUST fail in tests.

### II. Spec-Driven Development (SDD)

All production features follow: constitution → specify → plan → tasks → implement → validate. Spec artifacts live in `.specify/specs/`. No feature ships without an approved spec and passing contract tests.

### III. Test-First Discipline (TDD)

Red-green-refactor is mandatory. Vitest for Workers/Next.js, Pytest for FastAPI VPS services, Playwright for E2E. Contract tests validate OpenAPI and JSON Schema events before implementation merges.

### IV. Event-Driven Consistency

Domain changes emit events via Outbox pattern through the Messaging Worker. CF Queues at the edge; NATS optional only inside VPS for FastAPI ↔ FastAPI. Every event carries `idempotency_key`, `correlation_id`, and `tenant_id`.

### V. Hybrid Architecture

- **Cloudflare edge:** Next.js, Worker App (BFF/auth), Worker Messaging (queues/outbox), Worker Agents (12 business agents), Worker Embedded (runtime monitoring agents 41–55).
- **Hetzner VPS:** PostgreSQL (source of truth via Hyperdrive), Redis, Qdrant, MinIO, N8N, Chatwoot, FastAPI heavy services (OCR, Fiscal, Reporting).
- Workers MUST NOT become a monolithic proxy to VPS; edge handles auth, rate limit, tenant context.

### VI. Security & LGPD

MFA (TOTP) required for admin roles. PII masked in logs. Tenant export/delete supported. Secrets never committed. WAF, Turnstile, rate limiting per tenant at Cloudflare edge.

### VII. Simplicity (YAGNI)

MVP scope: Core IAM, Finance AP/AR/Caixa/Conciliação/Agenda Financeira, Messaging, OCR stub, N8N/Chatwoot bridges, 12 business agents scaffold. Defer Marketplace, White Label, full BI to post-MVP.

## Quality Gates

| Gate | Requirement |
|------|-------------|
| Spec | Passes `speckit-checklist` before plan |
| Plan | Constitution check + data-model reviewed |
| Implement | Contract tests green; tenant isolation tests pass |
| Revalidation | Agents 26–40 PASS before release (Agent 40 gate) |
| Frontend | **LAYOUT-APPROVAL-REQUIRED** checkpoint before UI beyond technical shell |

## Development Workflow

1. Read `.specify/memory/constitution.md` and relevant spec at session start
2. Execute Spec Kit phases in order
3. Propagate `trace_id` / `correlation_id` across Workers and VPS
4. Document specs and user-facing copy in Portuguese (pt-BR)

## Governance

This constitution supersedes ad-hoc practices and conflicting architecture docs. Amendments require version bump and ADR. `.md` is the single source of truth (docx deprecated).

**Version**: 1.0.0 | **Ratified**: 2026-06-15 | **Last Amended**: 2026-06-15
