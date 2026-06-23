# Validation Report — inova-finance-ai

**Data:** 2026-06-23
**Fase:** QA / validação (Claude Code)
**Status:** ✅ APPROVED — **11/11 testes verdes**

## Testes — `pnpm -r run test` (vitest)

| Workspace | Resultado |
|-----------|-----------|
| `apps/web` | ✅ 1/1 |
| `workers/app-api` | ✅ 5/5 (auth) |
| `workers/messaging` | ✅ 1/1 |
| `workers/agents-runtime` | ✅ 1/1 |
| `workers/embedded-runtime` | ✅ 1/1 |
| `packages/events` | ✅ 2/2 |
| **Total** | **✅ 11/11** |

Testes unitários. e2e (Playwright) não executado (requer servidores/infra).

## Nota de ambiente (importante)

A pasta de origem em `C:\Projetos DEV` está sob **Syncthing** (marcador `.stfolder`), o que causa **EPERM/travamento** do `pnpm install` (filter driver intercepta os arquivos temporários). A validação foi feita numa **cópia em local não-sincronizado** (`C:\dev-qa`), onde o install limpo via `npx pnpm@10 install` completou em ~35s e os testes rodaram verdes.

**Recomendação de infra:** mover este projeto (e os demais) para fora da pasta sincronizada do Syncthing, ou excluí-lo do sync, para builds/instalações estáveis.

## Segurança / LGPD

- Nenhum `.env` versionado; `.gitignore` cobre `.env`/`.env.*`.

## Recomendação

✅ Sem bloqueios. Monorepo pnpm (turbo + prisma + next + Cloudflare Workers). Ambiente: node v24.17, pnpm 10.
