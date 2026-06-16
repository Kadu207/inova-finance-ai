# Spec: Core — IAM, RBAC, Multiempresa, Multifilial, Auditoria

**Feature ID:** `core-iam`  
**Status:** Approved  
**Agent:** 02 Specify Core

## User Stories

### US-C01 — Autenticação com MFA

Como administrador, quero habilitar MFA TOTP para proteger acesso admin.

**Acceptance:**
- TOTP setup/verify/disable endpoints
- MFA obrigatório para roles `admin`, `owner`
- Backup codes gerados uma vez

### US-C02 — RBAC Multitenant

Como gestor, quero roles e permissions por tenant/filial.

**Acceptance:**
- Roles: `owner`, `admin`, `finance`, `viewer`, `support`
- Permissions granulares: `finance:read`, `finance:write`, `tenant:admin`
- Nenhuma query sem `tenantId`

### US-C03 — Multiempresa / Multifilial

Como holding, quero múltiplas filiais sob um tenant.

**Acceptance:**
- `Tenant` → `Branch[]` hierarchy
- Header `X-Branch-Id` filtra escopo
- Usuário pode ter acesso a subset de filiais

### US-C04 — Auditoria

Como auditor, quero trilha imutável de ações.

**Acceptance:**
- `AuditLog` com actor, action, resource, before/after JSON
- Retention configurável por tenant (LGPD)

## Contratos

Ver `contracts/openapi-core.yaml`

## Non-Goals (MVP)

- SSO SAML/OIDC (fase posterior)
- Social login
