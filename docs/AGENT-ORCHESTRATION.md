# Orquestração de Agentes — Inova Finance AI

Registry completo: [`.specify/agents/registry.yml`](../.specify/agents/registry.yml)

## Faixas

| Faixa | IDs | Função |
|-------|-----|--------|
| SDD | 01–07 | Constitution, specs, plans, data model |
| Build | 08–25 | Workers, web, VPS, 12 agentes negócio, testes |
| Revalidação | 26–40 | Release gate (security, tenant, finance, LGPD) |
| Embedded | 41–55 | Monitoramento pós-deploy (cron + DO) |

## Comandos por fase

```bash
# Dev local (Agentes 06–09)
pnpm dev:local

# Testes (Agentes 24, 37)
pnpm test && pnpm test:contract

# E2E (Agente 25)
pnpm test:e2e

# Pipeline tasks
cat .specify/specs/pipeline/tasks.md
```

## Staging (Agentes 06 + 40)

1. Preencher `infra/cloudflare/staging.env.example`
2. `wrangler login` + secrets
3. Deploy via `.github/workflows/deploy.yml`
4. Re-run revalidação 26–40
