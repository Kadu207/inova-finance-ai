# ADR-001: Arquitetura Híbrida Cloudflare + Hetzner VPS

## Status

Accepted — 2026-06-15

## Context

Inova Finance AI is an enterprise multitenant ERP with AI agents, OCR, fiscal processing, N8N automation, and Chatwoot support. Pure Cloudflare Workers cannot handle long-running OCR/SPED jobs. Pure VPS loses edge auth, rate limiting, and global latency benefits.

## Decision

Adopt **Option C — Hybrid Architecture**:

| Layer | Technology | Responsibility |
|-------|------------|----------------|
| Frontend | Next.js 15 on Cloudflare Pages | UI shell, auth guards, tenant switcher |
| Edge API | Worker App (`app-api`) | BFF, JWT/session, RBAC, Hyperdrive queries |
| Messaging | Worker Messaging | CF Queues, outbox/inbox, webhook ingress |
| Agents | Worker Agents Runtime | 12 business agents (CF Agents SDK + DO) |
| Embedded | Worker Embedded Runtime | Agents 41–55 monitoring/reconciliation |
| Database | PostgreSQL on Hetzner via Hyperdrive | Source of truth, RLS multitenant |
| Heavy compute | FastAPI on VPS | OCR, Fiscal, Reporting |
| Automation | N8N + Chatwoot on VPS | Workflows, omnichannel support |
| Internal bus | NATS (optional, VPS only) | FastAPI ↔ FastAPI only |

## Consequences

**Positive:** Edge latency for reads; scalable messaging; VPS for heavy Python workloads; clear bounded contexts.

**Negative:** Operational complexity (two environments); Hyperdrive latency BR↔CF must be monitored; signed HTTP bridge VPS ↔ CF required.

## Alternatives Rejected

- **100% Cloudflare:** OCR/fiscal/reporting exceed Worker CPU/time limits.
- **100% FastAPI VPS:** Contradicts separate Workers for app and messaging; loses edge security.

## References

- `Inova_Finance_AI_Arquitetura.md` v2.0
- Plan: Plano Mestre — Inova Finance AI
