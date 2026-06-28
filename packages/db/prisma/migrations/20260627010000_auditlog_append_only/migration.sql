-- AuditLog APPEND-ONLY (auditoria imutável, Constitution VI). A role da aplicação
-- (inova_app) pode inserir e ler, mas não alterar/apagar entradas de auditoria.
-- Defensivo: só revoga se a role existir (em PROD ela é provisionada via secret).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'inova_app') THEN
    REVOKE UPDATE, DELETE ON "AuditLog" FROM inova_app;
  END IF;
END $$;
