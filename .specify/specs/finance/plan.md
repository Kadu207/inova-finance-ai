# Plan: Finance — AP, AR, Caixa, Agenda

**Agent:** 07 Plan Finance | **Status:** Approved | **Spec:** [spec.md](./spec.md)

## Summary

CRUD AP/AR com idempotency_key, cash-flow consolidado e agenda financeira persistidos em PostgreSQL via Prisma.

## Technical Context

- **API:** `/api/finance/*` em app-api
- **Models:** Payable, Receivable, BankAccount, CashMovement, FinanceAgendaItem
- **Events:** PayableCreated, ReceivableCreated via EVENTS_QUEUE

## Constitution Check

- [x] idempotency_key em writes
- [x] tenantId em todas queries
- [x] Eventos com correlation_id

## Implementation

| Endpoint | Store | Status |
|----------|-------|--------|
| GET/POST /payables | `db/finance-store.ts` | Done |
| GET/POST /receivables | `db/finance-store.ts` | Done |
| GET /cash-flow | Prisma aggregate | Done |
| GET /agenda | Prisma merge AP+AR | Done |
| Web AP/AR forms | `apps/web` | In progress |

## Próximo

- Conciliação bancária (US-F04)
- PIX/Tesouraria (US-F06)
- Frontend dashboard KPIs reais
