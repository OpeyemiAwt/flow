-- Older migrations grant privileges to a database-specific *_worker role.
-- Production keeps that compatibility role NOLOGIN while all active work is
-- handled by the dedicated auth, custody, payment, and indexer roles.
DO $$
DECLARE
  legacy_worker text := current_database() || '_worker';
  can_login boolean;
BEGIN
  SELECT rolcanlogin INTO can_login FROM pg_roles WHERE rolname = legacy_worker;
  IF FOUND AND NOT can_login THEN
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA flow FROM %I', legacy_worker);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA flow FROM %I', legacy_worker);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA flow FROM %I', legacy_worker);
    EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA flow FROM %I', legacy_worker);
    EXECUTE format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM %I', current_database(), legacy_worker);
  END IF;
END;
$$;
