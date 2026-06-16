# Spec: Integrações — N8N, Chatwoot, Event Catalog

**Feature ID:** `integrations-n8n-chatwoot`  
**Status:** Approved  
**Agent:** 04 Specify Integrations

## User Stories

### US-I01 — N8N Webhook Bridge

Worker Messaging recebe ações N8N com assinatura HMAC + `idempotency_key`.

### US-I02 — Chatwoot Omnichannel

Webhook `message.created` → fila → upsert conversa ERP → reply via API.

### US-I03 — Event Catalog

Catálogo versionado em `packages/events` com JSON Schema.

## Event Catalog (MVP)

| Event | Producer | Consumer |
|-------|----------|----------|
| `CustomerMessageReceived` | App API | N8N, Agents |
| `PayableDueSoon` | Embedded | N8N |
| `OcrJobCompleted` | OCR Service | App API |
| `IntegrationHealthChanged` | Embedded | Alerting |

## Mapeamentos

- `integration_chatwoot_links`: `source_id`, `tenant_id`, `customer_id`, `conversation_id`
- `integration_n8n_workflows`: `tenant_id`, `workflow_id`, `trigger_event`

## Contratos

Ver `contracts/events-catalog.json`
