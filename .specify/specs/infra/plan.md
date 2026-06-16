# Infra Plan — Cloudflare + Hetzner

**Agent:** 06 Plan Infra  
**Status:** Approved

## Cloudflare Workers

| Worker | Name (prod) | Bindings |
|--------|-------------|----------|
| `workers/app-api` | `inova-app-api` | Hyperdrive, KV (sessions), Service → messaging |
| `workers/messaging` | `inova-messaging` | Queues (inbound/outbound/DLQ), Service → app-api |
| `workers/agents-runtime` | `inova-agents` | Durable Objects, AI, Service → messaging |
| `workers/embedded-runtime` | `inova-embedded` | Queues, Cron Triggers, Service → app-api |

## Hyperdrive

- Connection to Hetzner PostgreSQL
- Pool per worker; migrations via CI only (direct connection)

## Hetzner VPS (docker-compose)

Services: `postgres`, `redis`, `qdrant`, `minio`, `n8n`, `chatwoot`, `ocr-api`, `fiscal-api`, `reporting-api`, `nginx` (CF Tunnel upstream)

## Secrets

- CF: `wrangler secret put` — JWT_SECRET, VPS_WEBHOOK_SECRET, OPENROUTER_API_KEY
- VPS: `.env` (never committed) — DATABASE_URL, MINIO keys, Chatwoot tokens

## Environments

- `staging`: wrangler `env.staging`, VPS staging compose overlay
- `production`: wrangler `env.production`, DNS `inovafinanceai.inovatitech.com.br`

## Deploy Commands

```bash
pnpm --filter @inova/app-api deploy:staging
cd infra/hetzner && docker compose up -d
```

Ver: `infra/cloudflare/README.md`, `infra/hetzner/docker-compose.yml`
