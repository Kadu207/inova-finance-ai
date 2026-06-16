# Plan: Core — IAM, RBAC, Multitenant

**Agent:** 07 Plan Core | **Status:** Approved | **Spec:** [spec.md](./spec.md)

## Summary

Implementar autenticação JWT + MFA TOTP, RBAC por tenant/filial e auditoria via Prisma/PostgreSQL, mantendo bootstrap demo para dev local.

## Technical Context

- **Stack:** Hono (app-api), Prisma, PostgreSQL 5442, KV sessions (MFA pending)
- **Storage:** User, UserTenant, Session, AuditLog models
- **Testing:** Vitest auth/RBAC/MFA unit tests

## Constitution Check

- [x] X-Tenant-Id obrigatório
- [x] MFA admin/owner
- [x] Tenant isolation em queries

## Implementation

| Componente | Path | Status |
|------------|------|--------|
| Auth routes | `workers/app-api/src/routes/auth.ts` | Prisma + KV fallback |
| RBAC | `workers/app-api/src/rbac.ts` | Done |
| MFA | `workers/app-api/src/mfa.ts` | Done |
| DB auth store | `workers/app-api/src/db/auth-store.ts` | Done |
| Seed demo | `workers/app-api/src/db/seed.ts` | Done |

## Próximo

- Session table em Prisma (refresh tokens)
- AuditLog em writes financeiros
- SSO OIDC (post-MVP)
