-- Improve incoming Flow-to-Flow sender + memo resolution for both exact hash
-- matches and cross-chain settlements whose solver payout hash differs or was
-- not yet stored, and ensure FORCE ROW LEVEL SECURITY owner/migrator policies
-- cover preference and address tables read by SECURITY DEFINER helpers.

BEGIN;

CREATE OR REPLACE FUNCTION flow.resolve_incoming_transfer_senders(
  p_account_id uuid,
  p_tx_hashes text[]
)
RETURNS TABLE (
  matched_tx_hash text,
  sender_flow_id text,
  sender_memo text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
BEGIN
  IF p_account_id IS NULL OR NOT flow.can_access_account(p_account_id) THEN
    RAISE EXCEPTION 'account access denied' USING ERRCODE = '42501';
  END IF;

  IF p_tx_hashes IS NULL OR array_length(p_tx_hashes, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH requested_hashes AS (
    SELECT DISTINCT LOWER(h) AS hash_lower
    FROM unnest(p_tx_hashes) AS h
    WHERE h IS NOT NULL AND BTRIM(h) <> ''
  ),
  recipient_addresses AS (
    SELECT DISTINCT LOWER(wa_rec.address) AS addr_lower
    FROM flow.wallets w_rec
    JOIN flow.wallet_addresses wa_rec ON wa_rec.wallet_id = w_rec.id
    WHERE w_rec.account_id = p_account_id
      AND w_rec.environment = 'mainnet'
  ),
  exact_matches AS (
    SELECT
      CASE
        WHEN ot.destination_tx_hash IS NOT NULL
          AND LOWER(ot.destination_tx_hash) IN (SELECT hash_lower FROM requested_hashes)
          THEN ot.destination_tx_hash
        ELSE ot.source_tx_hash
      END AS matched_hash,
      COALESCE(
        NULLIF(BTRIM(a_sender.flow_id), ''),
        NULLIF(BTRIM(ot.provider_quote_payload->>'senderFlowId'), ''),
        NULLIF(BTRIM(a_sender.name), '')
      )::text AS sender_flow_id,
      NULLIF(BTRIM(ot.provider_quote_payload->>'userMemo'), '')::text AS sender_memo,
      1 AS match_priority,
      0::double precision AS time_diff_seconds,
      ot.created_at
    FROM flow.outgoing_transfer_jobs ot
    JOIN flow.accounts a_sender ON a_sender.id = ot.account_id
    WHERE ot.job_kind = 'SEND'
      AND ot.account_id <> p_account_id
      AND LOWER(ot.recipient_address) IN (SELECT addr_lower FROM recipient_addresses)
      AND (
        (
          ot.destination_tx_hash IS NOT NULL
          AND LOWER(ot.destination_tx_hash) IN (SELECT hash_lower FROM requested_hashes)
        )
        OR (
          ot.source_tx_hash IS NOT NULL
          AND LOWER(ot.source_tx_hash) IN (SELECT hash_lower FROM requested_hashes)
        )
      )
  ),
  heuristic_matches AS (
    SELECT
      wa.tx_hash::text AS matched_hash,
      COALESCE(
        NULLIF(BTRIM(a_sender.flow_id), ''),
        NULLIF(BTRIM(ot.provider_quote_payload->>'senderFlowId'), ''),
        NULLIF(BTRIM(a_sender.name), '')
      )::text AS sender_flow_id,
      NULLIF(BTRIM(ot.provider_quote_payload->>'userMemo'), '')::text AS sender_memo,
      2 AS match_priority,
      ABS(
        EXTRACT(
          EPOCH FROM (
            COALESCE(wa.block_timestamp, wa.observed_at)
            - COALESCE(ot.settled_at, ot.updated_at, ot.created_at)
          )
        )
      )::double precision AS time_diff_seconds,
      ot.created_at
    FROM flow.wallet_activities wa
    JOIN flow.outgoing_transfer_jobs ot
      ON ot.job_kind = 'SEND'
      AND ot.account_id <> p_account_id
      AND ot.status IN ('SETTLED', 'PROVIDER_SETTLING', 'CONFIRMING')
      AND LOWER(ot.recipient_address) = LOWER(wa.to_address)
      AND UPPER(ot.destination_asset_symbol) = UPPER(wa.asset_symbol)
      AND (
        LOWER(ot.destination_network) = LOWER(wa.network)
        OR (LOWER(ot.destination_network) LIKE 'solana%' AND LOWER(wa.network) LIKE 'solana%')
        OR (LOWER(ot.destination_network) LIKE 'near%' AND LOWER(wa.network) LIKE 'near%')
        OR (LOWER(ot.destination_network) LIKE 'base%' AND LOWER(wa.network) LIKE 'base%')
        OR (LOWER(ot.destination_network) LIKE 'ethereum%' AND LOWER(wa.network) LIKE 'ethereum%')
      )
      AND COALESCE(wa.block_timestamp, wa.observed_at)
        BETWEEN ot.created_at - INTERVAL '2 minutes'
        AND COALESCE(ot.settled_at, ot.updated_at, ot.created_at) + INTERVAL '20 minutes'
      AND (
        ot.expected_destination_atomic_amount IS NULL
        OR ot.expected_destination_atomic_amount <= 0
        OR wa.atomic_amount BETWEEN
          (ot.expected_destination_atomic_amount * 0.75)
          AND (ot.expected_destination_atomic_amount * 1.25)
      )
    JOIN flow.accounts a_sender ON a_sender.id = ot.account_id
    WHERE wa.account_id = p_account_id
      AND wa.direction = 'INCOMING'
      AND LOWER(wa.tx_hash) IN (SELECT hash_lower FROM requested_hashes)
      AND LOWER(ot.recipient_address) IN (SELECT addr_lower FROM recipient_addresses)
  ),
  combined AS (
    SELECT * FROM exact_matches
    UNION ALL
    SELECT * FROM heuristic_matches
  )
  SELECT DISTINCT ON (LOWER(c.matched_hash))
    c.matched_hash AS matched_tx_hash,
    c.sender_flow_id,
    c.sender_memo
  FROM combined c
  WHERE c.matched_hash IS NOT NULL
  ORDER BY
    LOWER(c.matched_hash),
    c.match_priority ASC,
    c.time_diff_seconds ASC,
    c.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION flow.resolve_incoming_transfer_senders(uuid, text[]) FROM PUBLIC;

DO $$
DECLARE
  db_name text := current_database();
  app_role text := db_name || '_app';
  migrator_role text := db_name || '_migrator';
  definer_role text := current_user;
  r text;
  sel_tbl text;
  all_tbl text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.resolve_incoming_transfer_senders(uuid, text[]) TO %I', app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.resolve_wallet_address_flow_ids(text[]) TO %I', app_role);
  END IF;

  -- Ensure SECURITY DEFINER helpers owned by migrator/definer are never
  -- silently filtered by FORCE ROW LEVEL SECURITY across tables they read/write.
  FOREACH r IN ARRAY ARRAY[migrator_role, definer_role] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      FOREACH sel_tbl IN ARRAY ARRAY[
        'user_profile_preferences',
        'wallet_addresses',
        'account_memberships',
        'wallet_activities',
        'outgoing_transfer_jobs'
      ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON flow.%I', 'definer_read_' || r, sel_tbl);
        EXECUTE format('CREATE POLICY %I ON flow.%I FOR SELECT TO %I USING (true)', 'definer_read_' || r, sel_tbl, r);
      END LOOP;

      FOREACH all_tbl IN ARRAY ARRAY[
        'account_notification_preferences',
        'email_deliveries'
      ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON flow.%I', 'definer_all_' || r, all_tbl);
        EXECUTE format('CREATE POLICY %I ON flow.%I FOR ALL TO %I USING (true) WITH CHECK (true)', 'definer_all_' || r, all_tbl, r);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
