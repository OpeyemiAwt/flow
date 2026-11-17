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
    AND COALESCE(wa.from_address, '') NOT IN ('linear-protocol.near', 'contract.main.burrow.near')
    AND COALESCE(wa.to_address, '') NOT IN ('linear-protocol.near', 'contract.main.burrow.near')
    AND NOT EXISTS (
      SELECT 1
      FROM flow.outgoing_transfer_jobs otj
      WHERE otj.account_id = wa.account_id
        AND otj.provider_deposit_memo LIKE 'EARN:%'
        AND (otj.source_tx_hash = wa.tx_hash OR otj.destination_tx_hash = wa.tx_hash)
    )
  GROUP BY 1, 2;
END;
$$;
