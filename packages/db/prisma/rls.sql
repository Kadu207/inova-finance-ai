-- Row-Level Security: isolamento multitenant no NÍVEL DO BANCO
-- (defense-in-depth do C1, ver Constitution Princípio I).
--
-- O tenant corrente vem de `set_config('app.tenant_id', <id>, true)` setado dentro
-- da transação por `withTenantScope` (workers/app-api/src/db/client.ts). Com `true`,
-- `current_setting('app.tenant_id', true)` retorna NULL quando não setado → a policy
-- nega tudo (fail-closed). `FORCE` faz valer até para o owner (Prisma conecta como owner).
--
-- Aplicado em DEV via `pnpm db:rls` (após `db push`) e em PROD via migration
-- (prisma/migrations/.../migration.sql). NÃO se aplica às tabelas de identidade/
-- provisionamento (Tenant, User, UserTenant, Branch) — o login precisa consultá-las
-- entre tenants e o seed/provisionamento as escreve sem tenant corrente.
--
-- IMPORTANTE: superuser e owner com BYPASSRLS IGNORAM a RLS. A aplicação DEVE
-- conectar como a role NÃO-superuser abaixo (`inova_app`), senão a RLS não protege.
-- Em PROD, provisione `inova_app` com senha forte via secret e aponte o Hyperdrive/
-- DATABASE_URL para ela (a senha 'inova_app_dev' aqui é só para DEV local).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'inova_app') THEN
    CREATE ROLE inova_app WITH LOGIN PASSWORD 'inova_app_dev';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO inova_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO inova_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO inova_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO inova_app;

-- AuditLog é APPEND-ONLY (imutável): a app pode inserir e ler, nunca alterar/apagar.
REVOKE UPDATE, DELETE ON "AuditLog" FROM inova_app;

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
