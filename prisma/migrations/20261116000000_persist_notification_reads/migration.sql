BEGIN;

CREATE TABLE flow.account_notification_reads (
  account_id uuid NOT NULL REFERENCES flow.accounts(id) ON DELETE CASCADE,
  viewer_user_id uuid NOT NULL REFERENCES flow.users(id) ON DELETE CASCADE,
  notification_id text NOT NULL CHECK (char_length(notification_id) BETWEEN 1 AND 128),
  read_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id, viewer_user_id, notification_id)
);

CREATE INDEX account_notification_reads_viewer_idx
  ON flow.account_notification_reads (viewer_user_id, account_id, read_at DESC);

CREATE OR REPLACE FUNCTION flow.current_session_flow_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
  SELECT u.id
  FROM flow.users u
  WHERE u.auth_user_id = flow.current_session_auth_user_id()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION flow.current_session_flow_user_id() FROM PUBLIC;
ALTER TABLE flow.account_notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow.account_notification_reads FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  app_role text := current_database() || '_app';
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT SELECT, INSERT ON flow.account_notification_reads TO %I', app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.current_session_flow_user_id() TO %I', app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.can_access_account(uuid) TO %I', app_role);
    EXECUTE format($policy$
      CREATE POLICY account_notification_reads_app_select
      ON flow.account_notification_reads FOR SELECT TO %I
      USING (
        account_id = NULLIF(current_setting('flow.current_account_id', true), '')::uuid
        AND viewer_user_id = flow.current_session_flow_user_id()
        AND flow.can_access_account(account_id)
      )
    $policy$, app_role);
    EXECUTE format($policy$
      CREATE POLICY account_notification_reads_app_insert
      ON flow.account_notification_reads FOR INSERT TO %I
      WITH CHECK (
        account_id = NULLIF(current_setting('flow.current_account_id', true), '')::uuid
        AND viewer_user_id = flow.current_session_flow_user_id()
        AND flow.can_access_account(account_id)
      )
    $policy$, app_role);
  END IF;
END;
$$;

COMMIT;
