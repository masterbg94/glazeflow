-- Supabase lockdown.
--
-- Run this AFTER the schema exists in the target database and BEFORE the
-- application is pointed at it.
--
-- Why it is not optional on Supabase:
--   Supabase sets default privileges so that `anon` and `authenticated` get
--   full DML (SELECT, INSERT, UPDATE, DELETE, TRUNCATE) on every new table in
--   the `public` schema. The public anon key is public by definition. With
--   row level security disabled, that key can read and write every row of
--   every table through PostgREST — completely outside NextAuth, outside the
--   application code, and outside every check in `src/`.
--
--   Two ways to close it, both applied here:
--     1. Revoke the grants from `anon` and `authenticated`.
--     2. Enable row level security on every table, so even a grant that comes
--        back later is denied by default (no policy = deny).
--
-- What this deliberately does NOT do:
--   It does not use FORCE ROW LEVEL SECURITY. The application connects as the
--   table owner, which bypasses RLS by design, so the application keeps
--   working with its own authorization checks untouched. The point of this
--   file is to close the *public* database surface, not to re-implement tenant
--   isolation twice.
--   For per-tenant isolation enforced by the database itself, see
--   `prisma/postgres-rls.sql` — that one needs a role without BYPASSRLS and
--   a `SET LOCAL app.tenant_id` in every transaction.
--
-- Verified on the local Supabase stack (2026-10-22): `postgres` has
-- rolbypassrls = true, `anon` and `authenticated` do not, and the default
-- privileges grant them `arwdDxtm` on new tables in `public`.

-- ---------------------------------------------------------------------------
-- 1. New tables: no default grants for the public roles
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Existing tables: revoke the grants and turn row level security on
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM service_role', table_name);
    -- Enabled, not forced: the owner (the application) still bypasses it.
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. The audit trail is append only
-- ---------------------------------------------------------------------------
-- Nothing may change or remove a row that records what somebody did.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'AuditLog') THEN
    REVOKE UPDATE, DELETE ON TABLE public."AuditLog" FROM anon, authenticated, service_role;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Check
-- ---------------------------------------------------------------------------
-- After running this, a query as the anon role must fail:
--
--   SET ROLE anon;
--   SELECT * FROM public."Company";
--   ERROR: permission denied for table Company
--
-- And the application, connecting as the owner, must still work:
--
--   SET ROLE postgres;
--   SELECT count(*) FROM public."Company";
