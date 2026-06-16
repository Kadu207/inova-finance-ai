# Data Model — Inova Finance AI

**Agent:** 05 Plan Data  
**Status:** Draft → Approved for MVP

## Estratégia Multitenant

- **Row-level isolation** via `tenantId` em todas as tabelas de negócio
- **PostgreSQL RLS** habilitado em produção (policies por `tenant_id`)
- Índices compostos: `@@index([tenantId, status])`, `@@index([tenantId, dueDate])`

## Entidades Core

```
Tenant (id, name, slug, settings, createdAt, updatedAt)
Branch (id, tenantId, name, code, active)
User (id, email, passwordHash, mfaSecret?, mfaEnabled, createdAt)
UserTenant (userId, tenantId, role, branchIds[])
Session (id, userId, tokenHash, expiresAt, revokedAt?)
AuditLog (id, tenantId, actorId, action, resource, payload, createdAt)
```

## Entidades Financeiras

```
Payable (id, tenantId, branchId, supplierName, amount, dueDate, status, idempotencyKey)
Receivable (id, tenantId, branchId, customerName, amount, dueDate, status, idempotencyKey)
BankAccount (id, tenantId, branchId, name, bankCode, agency, account)
CashMovement (id, tenantId, bankAccountId, type, amount, pixKey?, reference, createdAt)
Reconciliation (id, tenantId, bankAccountId, status, matchedAt?)
FinanceAgendaItem (id, tenantId, branchId, title, dueDate, type, linkedResourceId?)
```

## Entidades Integração

```
OutboxEvent (id, tenantId, eventType, payload, status, idempotencyKey, createdAt)
InboxEvent (id, tenantId, source, payload, processedAt?, idempotencyKey)
ChatwootLink (id, tenantId, conversationId, sourceId, customerId)
N8nWorkflow (id, tenantId, workflowId, triggerEvent, active)
```

## Entidades OCR

```
OcrJob (id, tenantId, documentType, minioKey, status, confidence?, result?)
```

## Migration Plan

1. `001_init_core` — Tenant, User, Branch, AuditLog
2. `002_finance` — Payable, Receivable, BankAccount, CashMovement
3. `003_integrations` — Outbox, Inbox, Chatwoot, N8n
4. `004_ocr` — OcrJob
5. `005_rls` — PostgreSQL RLS policies (SQL migration)

Ver implementação: `packages/db/prisma/schema.prisma`
