# Cloudflare Workers — Deploy Guide

## Workers

| Package | Wrangler name | Purpose |
|---------|---------------|---------|
| `@inova/app-api` | `inova-app-api` | BFF, auth, finance, integrations |
| `@inova/messaging` | `inova-messaging` | Queues, outbox, webhook ingress |
| `@inova/agents-runtime` | `inova-agents` | 12 business agents |
| `@inova/embedded-runtime` | `inova-embedded` | Agents 41–55 cron monitoring |

## Prerequisites

```bash
pnpm install
wrangler login
```

## Secrets (production)

```bash
cd workers/app-api
wrangler secret put JWT_SECRET
wrangler secret put VPS_WEBHOOK_SECRET
```

## Hyperdrive

1. Create Hyperdrive config pointing to Hetzner PostgreSQL
2. Replace `HYPERDRIVE_ID` in `wrangler.jsonc`

## Queues

Create queues in CF dashboard:
- `inova-events`
- `inova-outbound`
- `inova-dlq`

## Deploy

```bash
pnpm --filter @inova/app-api deploy
pnpm --filter @inova/messaging deploy
pnpm --filter @inova/agents-runtime deploy
pnpm --filter @inova/embedded-runtime deploy
```

## Staging

```bash
pnpm --filter @inova/app-api deploy:staging
```

## DNS

Point `inovafinanceai.inovatitech.com.br` to Cloudflare Pages (web) and route `/api/*` to Worker App.
