-- ==============================================================================
-- Migration: Enable Row Level Security (RLS) & Defend against Anon Key Bypass
-- Target: PostgreSQL / Supabase
-- ==============================================================================

-- 1. Enable Row Level Security on all core application tables
ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS userdata ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS telemetry ENABLE ROW LEVEL SECURITY;

-- 2. Revoke unrestricted PostgREST public access from anon role
-- This prevents attackers from querying or dumping users / credentials using the public Anon Key
REVOKE ALL ON TABLE users FROM anon;
REVOKE ALL ON TABLE userdata FROM anon;
REVOKE ALL ON TABLE reports FROM anon;
REVOKE ALL ON TABLE telemetry FROM anon;

-- 3. Grant full permissions to postgres and service_role (used by backend/sync-server)
GRANT ALL ON TABLE users TO postgres, service_role;
GRANT ALL ON TABLE userdata TO postgres, service_role;
GRANT ALL ON TABLE reports TO postgres, service_role;
GRANT ALL ON TABLE telemetry TO postgres, service_role;

-- 4. Granular RLS Policies for Authenticated Clients (if PostgREST is used directly)
DROP POLICY IF EXISTS "Users can only read own profile" ON users;
CREATE POLICY "Users can only read own profile" ON users
  FOR SELECT TO authenticated
  USING (auth.uid()::text = id);

DROP POLICY IF EXISTS "Users can only update own profile" ON users;
CREATE POLICY "Users can only update own profile" ON users
  FOR UPDATE TO authenticated
  USING (auth.uid()::text = id)
  WITH CHECK (auth.uid()::text = id);

DROP POLICY IF EXISTS "Users can only access own userdata" ON userdata;
CREATE POLICY "Users can only access own userdata" ON userdata
  FOR ALL TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can insert reports" ON reports;
CREATE POLICY "Users can insert reports" ON reports
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Telemetry metrics readable and incrementable
DROP POLICY IF EXISTS "Telemetry public hits" ON telemetry;
CREATE POLICY "Telemetry public hits" ON telemetry
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
