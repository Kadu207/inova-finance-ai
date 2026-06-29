-- RLS para a tabela CostCenter (centro de custo). Defensivo (só se a tabela existir).

DO $$
BEGIN
  IF to_regclass('public."CostCenter"') IS NOT NULL THEN
    ALTER TABLE "CostCenter" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "CostCenter" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON "CostCenter";
    CREATE POLICY tenant_isolation ON "CostCenter"
      USING ("tenantId" = current_setting('app.tenant_id', true))
      WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
  END IF;
END $$;
