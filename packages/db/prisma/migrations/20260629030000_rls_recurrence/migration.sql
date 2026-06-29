-- RLS para a tabela Recurrence (títulos recorrentes). Defensivo (só se a tabela existir).

DO $$
BEGIN
  IF to_regclass('public."Recurrence"') IS NOT NULL THEN
    ALTER TABLE "Recurrence" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "Recurrence" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON "Recurrence";
    CREATE POLICY tenant_isolation ON "Recurrence"
      USING ("tenantId" = current_setting('app.tenant_id', true))
      WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
  END IF;
END $$;
