BEGIN;

-- The web process needs only the guarded, one-time session ticket functions.
-- Use a dedicated role ending in _worker because those functions independently
-- enforce that suffix; this role receives no table access.
DO $$
DECLARE
  auth_role text := current_database() || '_auth_worker';
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = auth_role) THEN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), auth_role);
    EXECUTE format('GRANT USAGE ON SCHEMA flow TO %I', auth_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.issue_email_auth_ticket(text, text) TO %I', auth_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.issue_google_auth_ticket(text, text, bigint) TO %I', auth_role);
  END IF;
END;
$$;

COMMIT;
