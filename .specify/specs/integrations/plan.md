# Plan: Integrations — N8N, Chatwoot, Events

**Agent:** 07 Plan Integrations | **Status:** Approved | **Spec:** [spec.md](./spec.md)

## Summary

Webhooks idempotentes N8N/Chatwoot via Worker Messaging + bridges VPS; catálogo de eventos Zod.

## Technical Context

- **Edge:** workers/messaging (outbox DO), workers/app-api (integration routes)
- **VPS:** services/bridges (FastAPI)
- **Events:** packages/events JSON Schema

## Implementation

| Componente | Path | Status |
|------------|------|--------|
| Event schemas | `packages/events` | Done |
| Messaging outbox | `workers/messaging` | Done |
| Integration routes | `workers/app-api/src/routes/integrations.ts` | Done |
| Bridges API | `services/bridges` | Stub |
| Chatwoot embed | `apps/web/support` | Mock UI |

## Próximo

- Redis para dedup local
- N8N + Chatwoot no dev-local stack
- E2E round-trip webhook test
