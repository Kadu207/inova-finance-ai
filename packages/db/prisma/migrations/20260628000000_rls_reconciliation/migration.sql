-- RLS para as tabelas de conciliação (US1 da spec 002). Mesmo padrão das demais:
-- isolamento por tenant via current_setting('app.tenant_id'); fail-closed sem GUC.

DO $$
DECLARE
  t text;
  protected_tables text[] := ARRAY['BankTransaction', 'ReconciliationMatch', 'ReconciliationSession'];
BEGIN
  FOREACH t IN ARRAY protected_tables LOOP
    -- Defensivo: o schema é aplicado via `db push`; só aplica RLS se a tabela existir.
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I '
        'USING ("tenantId" = current_setting(''app.tenant_id'', true)) '
        'WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))',
        t
      );
    END IF;
  END LOOP;
END $$;
