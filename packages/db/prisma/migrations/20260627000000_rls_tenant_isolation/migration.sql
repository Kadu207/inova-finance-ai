-- Row-Level Security: isolamento multitenant no nível do banco (defense-in-depth do C1).
-- Espelha packages/db/prisma/rls.sql. Aplicado em PROD via `prisma migrate deploy`.
-- O tenant corrente vem de set_config('app.tenant_id', <id>, true) em withTenantScope.

DO $$
DECLARE
  t text;
  protected_tables text[] := ARRAY[
    'Payable', 'Receivable', 'BankAccount', 'CashMovement', 'FinanceAgendaItem',
    'AuditLog', 'OutboxEvent', 'InboxEvent', 'ChatwootLink', 'N8nWorkflow', 'OcrJob'
  ];
BEGIN
  FOREACH t IN ARRAY protected_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING ("tenantId" = current_setting(''app.tenant_id'', true)) '
      'WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))',
      t
    );
  END LOOP;
END $$;
