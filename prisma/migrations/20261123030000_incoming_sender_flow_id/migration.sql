-- Resolve sender Flow ID and memo for incoming Flow-to-Flow transfers (both same-chain and cross-chain)
-- without weakening row-level security on flow.outgoing_transfer_jobs.

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
  SELECT DISTINCT ON (matched_hash)
    matched_hash AS matched_tx_hash,
    COALESCE(a_sender.flow_id, ot.provider_quote_payload->>'senderFlowId')::text AS sender_flow_id,
    NULLIF(BTRIM(ot.provider_quote_payload->>'userMemo'), '')::text AS sender_memo
  FROM (
    SELECT
      ot_inner.*,
      CASE
        WHEN ot_inner.destination_tx_hash IS NOT NULL
          AND LOWER(ot_inner.destination_tx_hash) = ANY(
            SELECT LOWER(h) FROM unnest(p_tx_hashes) AS h
          )
          THEN ot_inner.destination_tx_hash
        ELSE ot_inner.source_tx_hash
      END AS matched_hash
    FROM flow.outgoing_transfer_jobs ot_inner
    WHERE ot_inner.job_kind = 'SEND'
      AND ot_inner.account_id <> p_account_id
      AND (
        (
          ot_inner.source_tx_hash IS NOT NULL
          AND LOWER(ot_inner.source_tx_hash) = ANY(
            SELECT LOWER(h) FROM unnest(p_tx_hashes) AS h
          )
        )
        OR (
          ot_inner.destination_tx_hash IS NOT NULL
          AND LOWER(ot_inner.destination_tx_hash) = ANY(
            SELECT LOWER(h) FROM unnest(p_tx_hashes) AS h
          )
        )
      )
      AND EXISTS (
        SELECT 1
        FROM flow.wallets w_rec
        JOIN flow.wallet_addresses wa_rec ON wa_rec.wallet_id = w_rec.id
        WHERE w_rec.account_id = p_account_id
          AND w_rec.environment = 'mainnet'
          AND (
            wa_rec.address = ot_inner.recipient_address
            OR LOWER(wa_rec.address) = LOWER(ot_inner.recipient_address)
          )
      )
  ) ot
  JOIN flow.accounts a_sender ON a_sender.id = ot.account_id
  WHERE matched_hash IS NOT NULL
  ORDER BY matched_hash, ot.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION flow.resolve_wallet_address_flow_ids(
  p_addresses text[]
)
RETURNS TABLE (
  address_key text,
  flow_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
BEGIN
  IF flow.current_session_flow_user_id() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_addresses IS NULL OR array_length(p_addresses, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (LOWER(wa.address))
    LOWER(wa.address)::text AS address_key,
    a.flow_id::text AS flow_id
  FROM flow.wallet_addresses wa
  JOIN flow.wallets w ON w.id = wa.wallet_id
  JOIN flow.accounts a ON a.id = w.account_id
  WHERE w.environment = 'mainnet'
    AND a.flow_id IS NOT NULL
    AND LOWER(wa.address) = ANY(
      SELECT LOWER(addr) FROM unnest(p_addresses) AS addr
    )
  ORDER BY LOWER(wa.address), w.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION flow.resolve_incoming_transfer_senders(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.resolve_wallet_address_flow_ids(text[]) FROM PUBLIC;

DO $$
DECLARE
  db_name text := current_database();
  app_role text := db_name || '_app';
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.resolve_incoming_transfer_senders(uuid, text[]) TO %I', app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.resolve_wallet_address_flow_ids(text[]) TO %I', app_role);
  END IF;
END;
$$;
