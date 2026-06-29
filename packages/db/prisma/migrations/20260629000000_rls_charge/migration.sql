-- RLS para a tabela Charge (boleto/PIX). Mesmo padrão; defensivo (só se a tabela existir).

DO $$
BEGIN
  IF to_regclass('public."Charge"') IS NOT NULL THEN
    ALTER TABLE "Charge" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "Charge" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON "Charge";
    CREATE POLICY tenant_isolation ON "Charge"
      USING ("tenantId" = current_setting('app.tenant_id', true))
      WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
  END IF;
END $$;
