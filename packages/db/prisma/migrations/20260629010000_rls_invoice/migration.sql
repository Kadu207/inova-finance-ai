-- RLS para a tabela Invoice (NFS-e). Mesmo padrão; defensivo (só se a tabela existir).

DO $$
BEGIN
  IF to_regclass('public."Invoice"') IS NOT NULL THEN
    ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "Invoice" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON "Invoice";
    CREATE POLICY tenant_isolation ON "Invoice"
      USING ("tenantId" = current_setting('app.tenant_id', true))
      WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
  END IF;
END $$;
