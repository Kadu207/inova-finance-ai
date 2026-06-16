# Inova Finance AI

Enterprise multitenant ERP financeiro com IA, automação N8N e atendimento Chatwoot.

**Arquitetura:** Híbrida Cloudflare Workers + Hetzner VPS — ver [ADR-001](docs/adr/ADR-001-hybrid-architecture.md)

## Estrutura

```
apps/web/              Next.js 15 (shell técnico — checkpoint layout)
workers/app-api/       BFF + auth + finance
workers/messaging/     CF Queues + outbox
workers/agents-runtime/ 12 agentes negócio
workers/embedded-runtime/ Agentes 41–55 monitoramento
services/              FastAPI VPS (ocr, fiscal, reporting, bridges)
packages/db/           Prisma multitenant
packages/events/       JSON Schema eventos
packages/ui/           Design tokens (placeholder)
infra/                 Cloudflare + Hetzner docker-compose
.specify/              Spec Kit SDD
```

## Quick Start

Portas dedicadas INA — ver [docs/PORTS.md](docs/PORTS.md).

```bash
pnpm install
pnpm db:generate

# 1) API (porta fixa 8810)
pnpm --filter @inova/app-api dev

# 2) Web (porta fixa 3100) — se EBUSY no OneDrive: pnpm --filter @inova/web dev:clean
pnpm --filter @inova/web dev

# VPS stack (portas INA: PG 5442, Redis 6381, N8N 5680, Chatwoot 3101)
cd infra/hetzner
cp .env.example .env
docker compose up -d postgres redis n8n chatwoot
pnpm db:push

# Testes
pnpm test
```

**URLs locais:** Web http://localhost:3100 · API http://127.0.0.1:8810

## Demo Login

- Email: `admin@inova.local`
- Senha: `changeme` (bootstrap MVP only)

## Checkpoint Frontend

Layout v1 entregue — ver páginas `/dashboard`, `/payables`, `/receivables`, `/support`.

## Deploy

- CF Workers: `infra/cloudflare/README.md`
- VPS: `infra/hetzner/docker-compose.yml`
- CI: `.github/workflows/ci.yml`

## Spec Kit

Constitution: `.specify/memory/constitution.md`  
Skills: `.cursor/skills/speckit-*`
