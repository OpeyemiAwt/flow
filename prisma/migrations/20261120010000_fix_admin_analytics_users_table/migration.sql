-- Fix table name (flow.users, not flow.flow_users) and ensure SECURITY DEFINER owner/migrator
-- has SELECT RLS policies across queried tables so FORCE ROW LEVEL SECURITY does not filter rows.

CREATE OR REPLACE FUNCTION flow.get_admin_platform_user_counts()
RETURNS TABLE (
  total_users bigint,
  active_wallets bigint,
  total_accounts bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
DECLARE
  v_token text := NULLIF(current_setting('flow.current_session_token', true), '');
  v_admin_ok boolean := false;
BEGIN
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'admin authorization required' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM flow.auth_sessions s
    JOIN flow.auth_users u ON u.id = s.user_id
    JOIN flow.users fu ON fu.auth_user_id = u.id
    WHERE s.token = v_token
      AND s.expires_at > CURRENT_TIMESTAMP
      AND fu.active = true
      AND u.email_verified = true
      AND u.mailbox_paused = false
      AND LOWER(u.email) = 'opeyemimosesawt@gmail.com'
  )
  INTO v_admin_ok;

  IF NOT v_admin_ok THEN
    RAISE EXCEPTION 'admin authorization required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::bigint FROM flow.users WHERE active = true) AS total_users,
    (SELECT COUNT(*)::bigint FROM flow.wallets WHERE status = 'ACTIVE' AND environment = 'mainnet') AS active_wallets,
    (SELECT COUNT(*)::bigint FROM flow.accounts) AS total_accounts;
END;
$$;

CREATE OR REPLACE FUNCTION flow.get_admin_platform_volume_buckets()
RETURNS TABLE (
  direction text,
  asset_symbol text,
  total_display numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
DECLARE
  v_token text := NULLIF(current_setting('flow.current_session_token', true), '');
  v_admin_ok boolean := false;
BEGIN
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'admin authorization required' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM flow.auth_sessions s
    JOIN flow.auth_users u ON u.id = s.user_id
    JOIN flow.users fu ON fu.auth_user_id = u.id
    WHERE s.token = v_token
      AND s.expires_at > CURRENT_TIMESTAMP
      AND fu.active = true
      AND u.email_verified = true
      AND u.mailbox_paused = false
      AND LOWER(u.email) = 'opeyemimosesawt@gmail.com'
  )
  INTO v_admin_ok;

  IF NOT v_admin_ok THEN
    RAISE EXCEPTION 'admin authorization required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    CASE
      WHEN UPPER(wa.direction) IN ('IN', 'INBOUND') THEN 'IN'
      ELSE 'OUT'
    END AS direction,
    UPPER(wa.asset_symbol)::text AS asset_symbol,
    SUM(wa.atomic_amount / POWER(10::numeric, wa.decimals)) AS total_display
  FROM flow.wallet_activities wa
  JOIN flow.wallets w ON w.id = wa.wallet_id
  WHERE w.environment = 'mainnet'
    AND wa.reorg_status = 'CANONICAL'
    AND wa.atomic_amount > 0
    AND UPPER(wa.direction) IN ('IN', 'INBOUND', 'OUT', 'OUTBOUND')
  GROUP BY 1, 2;
END;
$$;

REVOKE ALL ON FUNCTION flow.get_admin_platform_user_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.get_admin_platform_volume_buckets() FROM PUBLIC;

DO $$
DECLARE
  db_name text := current_database();
  app_role text := db_name || '_app';
  migrator_role text := db_name || '_migrator';
  definer_role text := current_user;
  tbl text;
  r text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.get_admin_platform_user_counts() TO %I', app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.get_admin_platform_volume_buckets() TO %I', app_role);
  END IF;

  FOREACH r IN ARRAY ARRAY[migrator_role, definer_role] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      FOREACH tbl IN ARRAY ARRAY['auth_sessions', 'auth_users', 'users', 'accounts', 'wallets', 'wallet_activities'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON flow.%I', 'admin_analytics_read_' || r, tbl);
        EXECUTE format('CREATE POLICY %I ON flow.%I FOR SELECT TO %I USING (true)', 'admin_analytics_read_' || r, tbl, r);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
