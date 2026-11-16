-- Fix admin platform analytics volume buckets:
-- 1. wallet_activities stores direction as 'INCOMING' / 'OUTGOING' (not only 'IN'/'INBOUND'/'OUT'/'OUTBOUND')
-- 2. Include settled outgoing_transfer_jobs, add_money_intents, and payment_attempts not yet mirrored in wallet_activities

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
  WITH all_movements AS (
    SELECT
      CASE
        WHEN UPPER(wa.direction) IN ('IN', 'INBOUND', 'INCOMING') THEN 'IN'
        ELSE 'OUT'
      END AS dir,
      UPPER(wa.asset_symbol)::text AS sym,
      (wa.atomic_amount / POWER(10::numeric, wa.decimals)) AS display_amount
    FROM flow.wallet_activities wa
    JOIN flow.wallets w ON w.id = wa.wallet_id
    WHERE w.environment = 'mainnet'
      AND wa.reorg_status = 'CANONICAL'
      AND wa.atomic_amount > 0
      AND UPPER(wa.direction) IN ('IN', 'INBOUND', 'INCOMING', 'OUT', 'OUTBOUND', 'OUTGOING')

    UNION ALL

    SELECT
      'OUT'::text AS dir,
      UPPER(ot.source_asset_symbol)::text AS sym,
      (ot.source_atomic_amount / POWER(10::numeric, ot.source_decimals)) AS display_amount
    FROM flow.outgoing_transfer_jobs ot
    JOIN flow.wallets w ON w.id = ot.wallet_id
    WHERE w.environment = 'mainnet'
      AND ot.status = 'SETTLED'
      AND ot.source_atomic_amount > 0
      AND NOT EXISTS (
        SELECT 1 FROM flow.wallet_activities indexed
        WHERE indexed.account_id = ot.account_id
          AND ot.source_tx_hash IS NOT NULL
          AND indexed.tx_hash = ot.source_tx_hash
          AND UPPER(indexed.direction) IN ('OUT', 'OUTBOUND', 'OUTGOING')
          AND indexed.reorg_status = 'CANONICAL'
      )

    UNION ALL

    SELECT
      'IN'::text AS dir,
      UPPER(am.destination_asset_symbol)::text AS sym,
      (am.quoted_destination_atomic_amount / POWER(10::numeric, am.destination_decimals)) AS display_amount
    FROM flow.add_money_intents am
    JOIN flow.wallets w ON w.id = am.wallet_id
    WHERE w.environment = 'mainnet'
      AND am.status = 'SETTLED'
      AND am.quoted_destination_atomic_amount > 0
      AND NOT EXISTS (
        SELECT 1 FROM flow.wallet_activities indexed
        WHERE indexed.account_id = am.account_id
          AND am.destination_tx_hash IS NOT NULL
          AND indexed.tx_hash = am.destination_tx_hash
          AND UPPER(indexed.direction) IN ('IN', 'INBOUND', 'INCOMING')
          AND indexed.reorg_status = 'CANONICAL'
      )

    UNION ALL

    SELECT
      'IN'::text AS dir,
      UPPER(pr.destination_asset_symbol)::text AS sym,
      (pv.atomic_amount / POWER(10::numeric, pr.destination_decimals)) AS display_amount
    FROM flow.payment_requests pr
    JOIN flow.payment_attempts pa ON pa.payment_request_id = pr.id AND pa.status = 'SETTLED'
    JOIN flow.payment_verifications pv ON pv.payment_attempt_id = pa.id
    JOIN flow.wallets w ON w.account_id = pr.account_id AND w.environment = 'mainnet'
    WHERE pv.verification_type = 'DESTINATION_SETTLEMENT'
      AND pv.finality = 'FINALIZED'
      AND pv.tx_hash = pa.destination_tx_hash
      AND pv.atomic_amount > 0
      AND NOT EXISTS (
        SELECT 1 FROM flow.wallet_activities indexed
        WHERE indexed.account_id = pr.account_id
          AND indexed.tx_hash = pv.tx_hash
          AND UPPER(indexed.direction) IN ('IN', 'INBOUND', 'INCOMING')
          AND indexed.reorg_status = 'CANONICAL'
      )
  )
  SELECT
    m.dir AS direction,
    m.sym AS asset_symbol,
    SUM(m.display_amount) AS total_display
  FROM all_movements m
  GROUP BY 1, 2;
END;
$$;

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
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.get_admin_platform_volume_buckets() TO %I', app_role);
  END IF;

  FOREACH r IN ARRAY ARRAY[migrator_role, definer_role] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      FOREACH tbl IN ARRAY ARRAY[
        'outgoing_transfer_jobs',
        'add_money_intents',
        'payment_requests',
        'payment_attempts',
        'payment_verifications'
      ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON flow.%I', 'admin_analytics_read_' || r, tbl);
        EXECUTE format('CREATE POLICY %I ON flow.%I FOR SELECT TO %I USING (true)', 'admin_analytics_read_' || r, tbl, r);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
