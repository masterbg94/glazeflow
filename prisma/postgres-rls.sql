-- Row level security for PostgreSQL.
--
-- Reference implementation, applied when the SQLite -> PostgreSQL move happens
-- (see docs/postgres-migration.md). The application runs on SQLite today, so
-- this file is not executed yet.
--
-- Why two roles:
--   glazeflow_owner  owns the tables. It has BYPASSRLS-equivalent power and is
--                    used only by migrations and by a maintenance task.
--   glazeflow_app    is the role the application connects as. It has no
--                    BYPASSRLS, so every row it touches is filtered by the
--                    policies below, even if a query in the application code
--                    forgets its WHERE clause.
--
-- On Supabase this file is opt-in, not automatic. The `postgres` role in a
-- Supabase project has `rolbypassrls = true`, so policies do not constrain a
-- connection that uses it — which is what Prisma uses by default. To make the
-- policies real, create the `glazeflow_app` role below, point `DATABASE_URL`
-- at it, and set the context in every transaction. Until that is done, run
-- `prisma/postgres-supabase.sql` instead: it closes the public database
-- surface without touching the application's own checks.
--
-- How the application sets the context:
--   Every request that reads or writes tenant data must run inside a
--   transaction that first executes:
--       SET LOCAL app.tenant_id = '<customerOrgId>';
--       SET LOCAL app.company_id = '<companyId>';
--       SET LOCAL app.user_id = '<userId>';
--   `SET LOCAL` is scoped to the transaction, so a pooled connection cannot
--   leak one tenant's context into the next request.
--
-- The application layer keeps its own checks as well. RLS is the second line
-- of defense, not a replacement for them.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
-- CREATE ROLE glazeflow_owner LOGIN PASSWORD '...';
-- CREATE ROLE glazeflow_app LOGIN PASSWORD '...' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Company scoped tables: readable by the main company only.
ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Company" FORCE ROW LEVEL SECURITY;
CREATE POLICY company_scope ON "Company"
  USING (id = current_setting('app.company_id', true));

ALTER TABLE "GlassType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GlassType" FORCE ROW LEVEL SECURITY;
CREATE POLICY glass_scope ON "GlassType"
  USING ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "PvcProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PvcProfile" FORCE ROW LEVEL SECURITY;
CREATE POLICY profile_scope ON "PvcProfile"
  USING ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "HardwareItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HardwareItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY hardware_scope ON "HardwareItem"
  USING ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "ProductTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductTemplate" FORCE ROW LEVEL SECURITY;
CREATE POLICY template_scope ON "ProductTemplate"
  USING ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "ProcessingOption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProcessingOption" FORCE ROW LEVEL SECURITY;
CREATE POLICY processing_scope ON "ProcessingOption"
  USING ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "PriceList" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PriceList" FORCE ROW LEVEL SECURITY;
CREATE POLICY pricelist_scope ON "PriceList"
  USING ("companyId" = current_setting('app.company_id', true));

-- Tenant scoped tables: readable by the tenant that owns the row.
ALTER TABLE "CustomerOrg" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerOrg" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "CustomerOrg"
  USING (id = current_setting('app.tenant_id', true));

ALTER TABLE "CustomerPriceOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerPriceOverride" FORCE ROW LEVEL SECURITY;
CREATE POLICY override_scope ON "CustomerPriceOverride"
  USING ("customerOrgId" = current_setting('app.tenant_id', true));

ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" FORCE ROW LEVEL SECURITY;
CREATE POLICY order_scope ON "Order"
  USING ("customerOrgId" = current_setting('app.tenant_id', true));

ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY order_item_scope ON "OrderItem"
  USING (
    "orderId" IN (
      SELECT id FROM "Order" WHERE "customerOrgId" = current_setting('app.tenant_id', true)
    )
  );

ALTER TABLE "OrderMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderMessage" FORCE ROW LEVEL SECURITY;
CREATE POLICY order_message_scope ON "OrderMessage"
  USING (
    "orderId" IN (
      SELECT id FROM "Order" WHERE "customerOrgId" = current_setting('app.tenant_id', true)
    )
  );

ALTER TABLE "OrderStatusTransition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderStatusTransition" FORCE ROW LEVEL SECURITY;
CREATE POLICY transition_scope ON "OrderStatusTransition"
  USING (
    "orderId" IN (
      SELECT id FROM "Order" WHERE "customerOrgId" = current_setting('app.tenant_id', true)
    )
  );

-- The audit trail is readable by the platform owner only.
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_scope ON "AuditLog"
  USING (current_setting('app.is_platform_admin', true) = 'on');

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- GRANT USAGE ON SCHEMA public TO glazeflow_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO glazeflow_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO glazeflow_app;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO glazeflow_app;

-- The application must not be able to change the audit trail.
-- REVOKE UPDATE, DELETE ON "AuditLog" FROM glazeflow_app;

-- ---------------------------------------------------------------------------
-- Supabase: the public surface
-- ---------------------------------------------------------------------------
-- Supabase grants `anon` and `authenticated` full DML on new tables in the
-- `public` schema by default, and the public anon key can use PostgREST to
-- reach them. Run `prisma/postgres-supabase.sql` for that part.
