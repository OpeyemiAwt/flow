-- Hosted FLOW MCP server: per-account AI agent keys, USD spend limits,
-- spend ledger events, and atomic SECURITY DEFINER helpers compatible with
-- FLOW's FORCE ROW LEVEL SECURITY model.

BEGIN;

CREATE TABLE IF NOT EXISTS flow.mcp_agent_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES flow.accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES flow.users(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  token_prefix VARCHAR(32) NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'PAUSED', 'REVOKED')),
  max_total_usd_cents BIGINT NOT NULL DEFAULT 0 CHECK (max_total_usd_cents >= 0),
  max_per_tx_usd_cents BIGINT NOT NULL DEFAULT 0 CHECK (max_per_tx_usd_cents >= 0),
  max_daily_usd_cents BIGINT CHECK (max_daily_usd_cents IS NULL OR max_daily_usd_cents >= 0),
  can_read BOOLEAN NOT NULL DEFAULT true,
  can_send BOOLEAN NOT NULL DEFAULT false,
  can_convert BOOLEAN NOT NULL DEFAULT false,
  can_create_payment_links BOOLEAN NOT NULL DEFAULT false,
  allowed_networks TEXT[] NOT NULL DEFAULT ARRAY[
    'near-mainnet',
    'solana-mainnet',
    'base-mainnet',
    'ethereum-mainnet'
  ]::text[],
  allowed_recipients TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  expires_at TIMESTAMPTZ(3),
  last_used_at TIMESTAMPTZ(3),
  total_calls INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_agent_keys_account_created_idx
  ON flow.mcp_agent_keys (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS mcp_agent_keys_token_hash_idx
  ON flow.mcp_agent_keys (token_hash);

CREATE TABLE IF NOT EXISTS flow.mcp_agent_spend_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key_id UUID NOT NULL REFERENCES flow.mcp_agent_keys(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES flow.accounts(id) ON DELETE CASCADE,
  transfer_job_id UUID REFERENCES flow.outgoing_transfer_jobs(id) ON DELETE SET NULL,
  operation VARCHAR(24) NOT NULL CHECK (operation IN ('SEND', 'CONVERT')),
  source_asset_symbol VARCHAR(32) NOT NULL,
  source_network VARCHAR(64) NOT NULL,
  source_display_amount VARCHAR(64) NOT NULL,
  destination_asset_symbol VARCHAR(32) NOT NULL,
  destination_network VARCHAR(64) NOT NULL,
  recipient_label VARCHAR(256),
  usd_cents BIGINT NOT NULL DEFAULT 0 CHECK (usd_cents >= 0),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_agent_spend_events_key_created_idx
  ON flow.mcp_agent_spend_events (agent_key_id, created_at DESC);

CREATE INDEX IF NOT EXISTS mcp_agent_spend_events_transfer_job_idx
  ON flow.mcp_agent_spend_events (transfer_job_id);

ALTER TABLE flow.mcp_agent_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow.mcp_agent_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE flow.mcp_agent_spend_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow.mcp_agent_spend_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE flow.mcp_agent_keys FROM PUBLIC;
REVOKE ALL ON TABLE flow.mcp_agent_spend_events FROM PUBLIC;

-- Authenticate an MCP bearer/path token by SHA-256 hash and return live spend totals.
-- Live spend totals automatically exclude FAILED / REFUNDED transfer jobs.
CREATE OR REPLACE FUNCTION flow.mcp_authenticate_key(
  p_token_hash text
)
RETURNS TABLE (
  key_id uuid,
  account_id uuid,
  user_id uuid,
  name text,
  token_prefix text,
  status text,
  max_total_usd_cents bigint,
  max_per_tx_usd_cents bigint,
  max_daily_usd_cents bigint,
  can_read boolean,
  can_send boolean,
  can_convert boolean,
  can_create_payment_links boolean,
  allowed_networks text[],
  allowed_recipients text[],
  expires_at timestamptz,
  last_used_at timestamptz,
  total_calls integer,
  spent_total_usd_cents bigint,
  spent_24h_usd_cents bigint,
  flow_id text,
  account_name text,
  wallet_id uuid,
  wallet_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
DECLARE
  v_key flow.mcp_agent_keys%ROWTYPE;
BEGIN
  IF p_token_hash IS NULL OR length(p_token_hash) <> 64 THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_key
  FROM flow.mcp_agent_keys k
  WHERE k.token_hash = p_token_hash
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_key.status = 'ACTIVE' AND (v_key.expires_at IS NULL OR v_key.expires_at > now()) THEN
    UPDATE flow.mcp_agent_keys k
    SET last_used_at = now(),
        total_calls = k.total_calls + 1
    WHERE k.id = v_key.id;
  END IF;

  RETURN QUERY
  WITH spend AS (
    SELECT
      COALESCE(SUM(e.usd_cents), 0)::bigint AS total_cents,
      COALESCE(
        SUM(e.usd_cents) FILTER (WHERE e.created_at >= now() - interval '24 hours'),
        0
      )::bigint AS daily_cents
    FROM flow.mcp_agent_spend_events e
    LEFT JOIN flow.outgoing_transfer_jobs j ON j.id = e.transfer_job_id
    WHERE e.agent_key_id = v_key.id
      AND e.operation = 'SEND'
      AND COALESCE(j.status, 'PENDING_CUSTODY') NOT IN ('FAILED', 'REFUNDED')
  )
  SELECT
    v_key.id,
    v_key.account_id,
    v_key.user_id,
    v_key.name::text,
    v_key.token_prefix::text,
    v_key.status::text,
    v_key.max_total_usd_cents,
    v_key.max_per_tx_usd_cents,
    v_key.max_daily_usd_cents,
    v_key.can_read,
    v_key.can_send,
    v_key.can_convert,
    v_key.can_create_payment_links,
    v_key.allowed_networks,
    v_key.allowed_recipients,
    v_key.expires_at,
    now(),
    v_key.total_calls + 1,
    s.total_cents,
    s.daily_cents,
    a.flow_id::text,
    a.name::text,
    w.id,
    w.status::text
  FROM spend s
  JOIN flow.accounts a ON a.id = v_key.account_id
  LEFT JOIN flow.wallets w
    ON w.account_id = v_key.account_id
   AND w.environment = 'mainnet';
END;
$$;

-- Return mainnet wallet addresses and synced balances strictly for the token's account.
CREATE OR REPLACE FUNCTION flow.mcp_get_account_snapshot(
  p_token_hash text
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
DECLARE
  v_key flow.mcp_agent_keys%ROWTYPE;
  v_wallet_id uuid;
  v_wallet_status text;
  v_flow_id text;
  v_account_name text;
  v_addresses jsonb;
  v_balances jsonb;
BEGIN
  SELECT * INTO v_key
  FROM flow.mcp_agent_keys
  WHERE token_hash = p_token_hash
    AND status = 'ACTIVE'
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT a.flow_id::text, a.name::text, w.id, w.status::text
  INTO v_flow_id, v_account_name, v_wallet_id, v_wallet_status
  FROM flow.accounts a
  LEFT JOIN flow.wallets w
    ON w.account_id = a.id
   AND w.environment = 'mainnet'
  WHERE a.id = v_key.account_id
  LIMIT 1;

  IF v_wallet_id IS NULL THEN
    RETURN jsonb_build_object(
      'accountId', v_key.account_id,
      'flowId', v_flow_id,
      'accountName', v_account_name,
      'walletId', NULL,
      'walletStatus', NULL,
      'addresses', '[]'::jsonb,
      'balances', '[]'::jsonb
    );
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'network', wa.network,
        'chainId', wa.chain_id,
        'address', wa.address
      )
      ORDER BY wa.network ASC
    ),
    '[]'::jsonb
  )
  INTO v_addresses
  FROM flow.wallet_addresses wa
  WHERE wa.wallet_id = v_wallet_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'networkAssetId', na.id,
        'network', na.network,
        'chainId', na.chain_id,
        'tokenStandard', na.token_standard,
        'contractAddress', na.contract_address,
        'decimals', na.decimals,
        'symbol', COALESCE(na.symbol_override, ast.symbol),
        'name', COALESCE(na.name_override, ast.name),
        'atomicBalance', wb.atomic_balance::text,
        'syncStatus', wb.sync_status,
        'finality', wb.finality,
        'lastSyncedAt', wb.last_synced_at
      )
      ORDER BY na.network ASC, COALESCE(na.symbol_override, ast.symbol) ASC
    ),
    '[]'::jsonb
  )
  INTO v_balances
  FROM flow.wallet_balances wb
  JOIN flow.network_assets na ON na.id = wb.network_asset_id
  JOIN flow.assets ast ON ast.id = na.asset_id
  WHERE wb.wallet_id = v_wallet_id
    AND na.is_verified = true
    AND na.status = 'ACTIVE';

  RETURN jsonb_build_object(
    'accountId', v_key.account_id,
    'flowId', v_flow_id,
    'accountName', v_account_name,
    'walletId', v_wallet_id,
    'walletStatus', v_wallet_status,
    'addresses', v_addresses,
    'balances', v_balances
  );
END;
$$;

-- Return pending reserved atomic balance for an account/asset strictly via valid token.
CREATE OR REPLACE FUNCTION flow.mcp_get_reserved_atomic(
  p_token_hash text,
  p_network text,
  p_asset_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
DECLARE
  v_account_id uuid;
  v_reserved text;
BEGIN
  SELECT account_id INTO v_account_id
  FROM flow.mcp_agent_keys
  WHERE token_hash = p_token_hash
    AND status = 'ACTIVE'
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RETURN '0';
  END IF;

  SELECT COALESCE(SUM(source_atomic_amount), 0)::text
  INTO v_reserved
  FROM flow.outgoing_transfer_jobs
  WHERE account_id = v_account_id
    AND source_network = p_network
    AND source_asset_id = p_asset_id
    AND status IN ('PENDING_CUSTODY', 'LEASED', 'SIGNING_IN_PROGRESS');

  RETURN COALESCE(v_reserved, '0');
END;
$$;

-- Look up existing outgoing transfer by idempotency key for safe MCP retries.
CREATE OR REPLACE FUNCTION flow.mcp_find_transfer_by_idempotency(
  p_token_hash text,
  p_idempotency_key uuid
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
DECLARE
  v_account_id uuid;
  v_result jsonb;
BEGIN
  SELECT account_id INTO v_account_id
  FROM flow.mcp_agent_keys
  WHERE token_hash = p_token_hash
    AND status = 'ACTIVE'
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', j.id,
    'publicId', j.public_id,
    'accountId', j.account_id,
    'walletId', j.wallet_id,
    'jobKind', j.job_kind,
    'sourceNetwork', j.source_network,
    'sourceAssetId', j.source_asset_id,
    'sourceAssetSymbol', j.source_asset_symbol,
    'sourceDecimals', j.source_decimals,
    'sourceAtomicAmount', j.source_atomic_amount::text,
    'recipientAddress', j.recipient_address,
    'destinationNetwork', j.destination_network,
    'destinationAssetId', j.destination_asset_id,
    'destinationAssetSymbol', j.destination_asset_symbol,
    'destinationDecimals', j.destination_decimals,
    'quotedDestinationAtomicAmount', j.expected_destination_atomic_amount::text,
    'providerDepositAddress', j.provider_deposit_address,
    'providerDepositMemo', j.provider_deposit_memo,
    'providerCorrelationId', j.provider_correlation_id,
    'status', j.status,
    'sourceTxHash', j.source_tx_hash,
    'destinationTxHash', j.destination_tx_hash,
    'feeAtomicAmount', j.fee_atomic_amount::text,
    'errorCode', j.error_code,
    'errorMessage', j.error_message,
    'broadcastAt', j.broadcast_at,
    'settledAt', j.settled_at,
    'createdAt', j.created_at,
    'updatedAt', j.updated_at
  )
  INTO v_result
  FROM flow.outgoing_transfer_jobs j
  WHERE j.account_id = v_account_id
    AND j.idempotency_key = p_idempotency_key
  LIMIT 1;

  RETURN v_result;
END;
$$;

-- Fetch a single outgoing transfer status strictly within the token's account.
CREATE OR REPLACE FUNCTION flow.mcp_get_transfer(
  p_token_hash text,
  p_transfer_ref text
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
DECLARE
  v_account_id uuid;
  v_result jsonb;
BEGIN
  SELECT account_id INTO v_account_id
  FROM flow.mcp_agent_keys
  WHERE token_hash = p_token_hash
    AND status = 'ACTIVE'
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', j.id,
    'publicId', j.public_id,
    'accountId', j.account_id,
    'walletId', j.wallet_id,
    'jobKind', j.job_kind,
    'sourceNetwork', j.source_network,
    'sourceAssetId', j.source_asset_id,
    'sourceAssetSymbol', j.source_asset_symbol,
    'sourceDecimals', j.source_decimals,
    'sourceAtomicAmount', j.source_atomic_amount::text,
    'recipientAddress', j.recipient_address,
    'destinationNetwork', j.destination_network,
    'destinationAssetId', j.destination_asset_id,
    'destinationAssetSymbol', j.destination_asset_symbol,
    'destinationDecimals', j.destination_decimals,
    'quotedDestinationAtomicAmount', j.expected_destination_atomic_amount::text,
    'providerDepositAddress', j.provider_deposit_address,
    'providerDepositMemo', j.provider_deposit_memo,
    'providerCorrelationId', j.provider_correlation_id,
    'status', j.status,
    'sourceTxHash', j.source_tx_hash,
    'destinationTxHash', j.destination_tx_hash,
    'feeAtomicAmount', j.fee_atomic_amount::text,
    'errorCode', j.error_code,
    'errorMessage', j.error_message,
    'broadcastAt', j.broadcast_at,
    'settledAt', j.settled_at,
    'createdAt', j.created_at,
    'updatedAt', j.updated_at
  )
  INTO v_result
  FROM flow.outgoing_transfer_jobs j
  WHERE j.account_id = v_account_id
    AND (j.id::text = p_transfer_ref OR j.public_id = p_transfer_ref)
  LIMIT 1;

  RETURN v_result;
END;
$$;

-- List recent transfers and on-chain activities strictly within the token's account.
CREATE OR REPLACE FUNCTION flow.mcp_list_activity(
  p_token_hash text,
  p_limit integer DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
DECLARE
  v_account_id uuid;
  v_lim integer := GREATEST(1, LEAST(COALESCE(p_limit, 20), 50));
  v_transfers jsonb;
  v_activities jsonb;
BEGIN
  SELECT account_id INTO v_account_id
  FROM flow.mcp_agent_keys
  WHERE token_hash = p_token_hash
    AND status = 'ACTIVE'
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(
    jsonb_agg(t ORDER BY (t->>'createdAt') DESC),
    '[]'::jsonb
  )
  INTO v_transfers
  FROM (
    SELECT jsonb_build_object(
      'publicId', j.public_id,
      'jobKind', j.job_kind,
      'sourceNetwork', j.source_network,
      'sourceAssetSymbol', j.source_asset_symbol,
      'sourceAtomicAmount', j.source_atomic_amount::text,
      'sourceDecimals', j.source_decimals,
      'destinationNetwork', j.destination_network,
      'destinationAssetSymbol', j.destination_asset_symbol,
      'quotedDestinationAtomicAmount', j.expected_destination_atomic_amount::text,
      'destinationDecimals', j.destination_decimals,
      'recipientAddress', j.recipient_address,
      'recipientLabel', j.provider_quote_payload->>'recipientLabel',
      'mcpAgentName', j.provider_quote_payload->>'mcpAgentName',
      'status', j.status,
      'sourceTxHash', j.source_tx_hash,
      'destinationTxHash', j.destination_tx_hash,
      'createdAt', j.created_at,
      'settledAt', j.settled_at
    ) AS t
    FROM flow.outgoing_transfer_jobs j
    WHERE j.account_id = v_account_id
    ORDER BY j.created_at DESC
    LIMIT v_lim
  ) sub;

  SELECT COALESCE(
    jsonb_agg(a ORDER BY (a->>'timestamp') DESC),
    '[]'::jsonb
  )
  INTO v_activities
  FROM (
    SELECT jsonb_build_object(
      'id', wa.id,
      'network', wa.network,
      'direction', wa.direction,
      'activityType', wa.activity_type,
      'assetSymbol', wa.asset_symbol,
      'atomicAmount', wa.atomic_amount::text,
      'decimals', wa.decimals,
      'txHash', wa.tx_hash,
      'fromAddress', wa.from_address,
      'toAddress', wa.to_address,
      'finality', wa.finality,
      'timestamp', COALESCE(wa.block_timestamp, wa.observed_at)
    ) AS a
    FROM flow.wallet_activities wa
    WHERE wa.account_id = v_account_id
    ORDER BY COALESCE(wa.block_timestamp, wa.observed_at) DESC
    LIMIT v_lim
  ) sub2;

  RETURN jsonb_build_object(
    'outgoingTransfers', v_transfers,
    'walletActivities', v_activities
  );
END;
$$;

-- Atomically lock agent key, verify spend limits (for SEND) & permissions,
-- enqueue the outgoing_transfer_jobs row, and record the spend event.
CREATE OR REPLACE FUNCTION flow.mcp_enqueue_transfer(
  p_token_hash text,
  p_public_id text,
  p_wallet_id uuid,
  p_idempotency_key uuid,
  p_job_kind text,
  p_source_network text,
  p_source_asset_id text,
  p_source_asset_symbol text,
  p_source_decimals integer,
  p_source_atomic_amount numeric,
  p_source_display_amount text,
  p_recipient_address text,
  p_recipient_label text,
  p_destination_network text,
  p_destination_asset_id text,
  p_destination_asset_symbol text,
  p_destination_decimals integer,
  p_expected_destination_atomic_amount numeric,
  p_provider_deposit_address text,
  p_provider_deposit_memo text,
  p_provider_correlation_id text,
  p_provider_quote_payload jsonb,
  p_usd_cents bigint
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
DECLARE
  v_key flow.mcp_agent_keys%ROWTYPE;
  v_spent_total bigint := 0;
  v_spent_24h bigint := 0;
  v_job_id uuid;
  v_job_row jsonb;
  v_existing jsonb;
  v_recipient_norm text := LOWER(BTRIM(COALESCE(p_recipient_address, '')));
  v_label_norm text := LOWER(BTRIM(COALESCE(p_recipient_label, '')));
BEGIN
  -- Serialize concurrent requests for this agent key to prevent parallel cap bypasses.
  SELECT * INTO v_key
  FROM flow.mcp_agent_keys
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'MCP_INVALID_TOKEN');
  END IF;

  IF v_key.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'MCP_KEY_NOT_ACTIVE', 'status', v_key.status);
  END IF;

  IF v_key.expires_at IS NOT NULL AND v_key.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'MCP_KEY_EXPIRED');
  END IF;

  -- Check idempotency inside the lock
  SELECT jsonb_build_object(
    'id', j.id,
    'publicId', j.public_id,
    'accountId', j.account_id,
    'walletId', j.wallet_id,
    'jobKind', j.job_kind,
    'sourceNetwork', j.source_network,
    'sourceAssetId', j.source_asset_id,
    'sourceAssetSymbol', j.source_asset_symbol,
    'sourceDecimals', j.source_decimals,
    'sourceAtomicAmount', j.source_atomic_amount::text,
    'recipientAddress', j.recipient_address,
    'destinationNetwork', j.destination_network,
    'destinationAssetId', j.destination_asset_id,
    'destinationAssetSymbol', j.destination_asset_symbol,
    'destinationDecimals', j.destination_decimals,
    'quotedDestinationAtomicAmount', j.expected_destination_atomic_amount::text,
    'providerDepositAddress', j.provider_deposit_address,
    'providerDepositMemo', j.provider_deposit_memo,
    'providerCorrelationId', j.provider_correlation_id,
    'status', j.status,
    'sourceTxHash', j.source_tx_hash,
    'destinationTxHash', j.destination_tx_hash,
    'feeAtomicAmount', j.fee_atomic_amount::text,
    'errorCode', j.error_code,
    'errorMessage', j.error_message,
    'broadcastAt', j.broadcast_at,
    'settledAt', j.settled_at,
    'createdAt', j.created_at,
    'updatedAt', j.updated_at
  )
  INTO v_existing
  FROM flow.outgoing_transfer_jobs j
  WHERE j.account_id = v_key.account_id
    AND j.idempotency_key = p_idempotency_key
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'transfer', v_existing);
  END IF;

  -- Permission checks
  IF p_job_kind = 'SEND' AND NOT v_key.can_send THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'MCP_SEND_NOT_ALLOWED');
  END IF;

  IF p_job_kind = 'CONVERT' AND NOT v_key.can_convert THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'MCP_CONVERT_NOT_ALLOWED');
  END IF;

  -- Network scope checks
  IF NOT (p_source_network = ANY(v_key.allowed_networks))
     OR NOT (p_destination_network = ANY(v_key.allowed_networks)) THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'MCP_NETWORK_NOT_ALLOWED');
  END IF;

  -- Verify wallet belongs to this key's account and is ACTIVE mainnet
  IF NOT EXISTS (
    SELECT 1
    FROM flow.wallets w
    WHERE w.id = p_wallet_id
      AND w.account_id = v_key.account_id
      AND w.environment = 'mainnet'
      AND w.status = 'ACTIVE'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'ACTIVE_MAINNET_WALLET_REQUIRED');
  END IF;

  -- Spend limits apply strictly to SEND (external value leaving the wallet).
  -- CONVERT stays inside the user's own FLOW wallet under its own can_convert toggle.
  IF p_job_kind = 'SEND' THEN
    IF array_length(v_key.allowed_recipients, 1) IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM unnest(v_key.allowed_recipients) AS allowed_r
        WHERE LOWER(BTRIM(allowed_r)) = v_recipient_norm
           OR (v_label_norm <> '' AND LOWER(BTRIM(allowed_r)) = v_label_norm)
      ) THEN
        RETURN jsonb_build_object('ok', false, 'errorCode', 'MCP_RECIPIENT_NOT_ALLOWED');
      END IF;
    END IF;

    IF v_key.max_total_usd_cents <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'errorCode', 'MCP_READ_ONLY_BUDGET');
    END IF;

    IF p_usd_cents IS NULL OR p_usd_cents < 0 THEN
      RETURN jsonb_build_object('ok', false, 'errorCode', 'MCP_USD_VALUATION_REQUIRED');
    END IF;

    IF v_key.max_per_tx_usd_cents > 0 AND p_usd_cents > v_key.max_per_tx_usd_cents THEN
      RETURN jsonb_build_object(
        'ok', false,
        'errorCode', 'MCP_PER_TX_LIMIT_EXCEEDED',
        'requestedUsdCents', p_usd_cents,
        'maxPerTxUsdCents', v_key.max_per_tx_usd_cents
      );
    END IF;

    SELECT
      COALESCE(SUM(e.usd_cents), 0)::bigint,
      COALESCE(
        SUM(e.usd_cents) FILTER (WHERE e.created_at >= now() - interval '24 hours'),
        0
      )::bigint
    INTO v_spent_total, v_spent_24h
    FROM flow.mcp_agent_spend_events e
    LEFT JOIN flow.outgoing_transfer_jobs j ON j.id = e.transfer_job_id
    WHERE e.agent_key_id = v_key.id
      AND e.operation = 'SEND'
      AND COALESCE(j.status, 'PENDING_CUSTODY') NOT IN ('FAILED', 'REFUNDED');

    IF v_key.max_daily_usd_cents IS NOT NULL
       AND (v_spent_24h + p_usd_cents) > v_key.max_daily_usd_cents THEN
      RETURN jsonb_build_object(
        'ok', false,
        'errorCode', 'MCP_DAILY_LIMIT_EXCEEDED',
        'requestedUsdCents', p_usd_cents,
        'spent24hUsdCents', v_spent_24h,
        'maxDailyUsdCents', v_key.max_daily_usd_cents
      );
    END IF;

    IF (v_spent_total + p_usd_cents) > v_key.max_total_usd_cents THEN
      RETURN jsonb_build_object(
        'ok', false,
        'errorCode', 'MCP_TOTAL_LIMIT_EXCEEDED',
        'requestedUsdCents', p_usd_cents,
        'spentTotalUsdCents', v_spent_total,
        'maxTotalUsdCents', v_key.max_total_usd_cents
      );
    END IF;
  END IF;

  INSERT INTO flow.outgoing_transfer_jobs (
    public_id,
    account_id,
    wallet_id,
    idempotency_key,
    job_kind,
    source_network,
    source_asset_id,
    source_asset_symbol,
    source_decimals,
    source_atomic_amount,
    recipient_address,
    destination_network,
    destination_asset_id,
    destination_asset_symbol,
    destination_decimals,
    expected_destination_atomic_amount,
    provider_deposit_address,
    provider_deposit_memo,
    provider_correlation_id,
    provider_quote_payload,
    status,
    created_by_user_id
  )
  VALUES (
    p_public_id,
    v_key.account_id,
    p_wallet_id,
    p_idempotency_key,
    p_job_kind,
    p_source_network,
    p_source_asset_id,
    p_source_asset_symbol,
    p_source_decimals,
    p_source_atomic_amount,
    p_recipient_address,
    p_destination_network,
    p_destination_asset_id,
    p_destination_asset_symbol,
    p_destination_decimals,
    p_expected_destination_atomic_amount,
    p_provider_deposit_address,
    p_provider_deposit_memo,
    p_provider_correlation_id,
    COALESCE(p_provider_quote_payload, '{}'::jsonb) || jsonb_build_object(
      'source', 'mcp',
      'mcpAgentKeyId', v_key.id,
      'mcpAgentName', v_key.name
    ),
    'PENDING_CUSTODY',
    v_key.user_id
  )
  RETURNING id, jsonb_build_object(
    'id', id,
    'publicId', public_id,
    'accountId', account_id,
    'walletId', wallet_id,
    'jobKind', job_kind,
    'sourceNetwork', source_network,
    'sourceAssetId', source_asset_id,
    'sourceAssetSymbol', source_asset_symbol,
    'sourceDecimals', source_decimals,
    'sourceAtomicAmount', source_atomic_amount::text,
    'recipientAddress', recipient_address,
    'destinationNetwork', destination_network,
    'destinationAssetId', destination_asset_id,
    'destinationAssetSymbol', destination_asset_symbol,
    'destinationDecimals', destination_decimals,
    'quotedDestinationAtomicAmount', expected_destination_atomic_amount::text,
    'providerDepositAddress', provider_deposit_address,
    'providerDepositMemo', provider_deposit_memo,
    'providerCorrelationId', provider_correlation_id,
    'status', status,
    'sourceTxHash', source_tx_hash,
    'destinationTxHash', destination_tx_hash,
    'feeAtomicAmount', fee_atomic_amount::text,
    'errorCode', error_code,
    'errorMessage', error_message,
    'broadcastAt', broadcast_at,
    'settledAt', settled_at,
    'createdAt', created_at,
    'updatedAt', updated_at
  )
  INTO v_job_id, v_job_row;

  INSERT INTO flow.mcp_agent_spend_events (
    agent_key_id,
    account_id,
    transfer_job_id,
    operation,
    source_asset_symbol,
    source_network,
    source_display_amount,
    destination_asset_symbol,
    destination_network,
    recipient_label,
    usd_cents
  )
  VALUES (
    v_key.id,
    v_key.account_id,
    v_job_id,
    p_job_kind,
    p_source_asset_symbol,
    p_source_network,
    p_source_display_amount,
    p_destination_asset_symbol,
    p_destination_network,
    COALESCE(NULLIF(BTRIM(p_recipient_label), ''), p_recipient_address),
    GREATEST(0, COALESCE(p_usd_cents, 0))
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'transfer', v_job_row,
    'spentTotalUsdCents', CASE WHEN p_job_kind = 'SEND' THEN v_spent_total + p_usd_cents ELSE v_spent_total END,
    'spent24hUsdCents', CASE WHEN p_job_kind = 'SEND' THEN v_spent_24h + p_usd_cents ELSE v_spent_24h END,
    'maxTotalUsdCents', v_key.max_total_usd_cents,
    'maxDailyUsdCents', v_key.max_daily_usd_cents
  );
END;
$$;

-- Create a FLOW Payment Link on behalf of the authenticated MCP key.
CREATE OR REPLACE FUNCTION flow.mcp_create_payment_link(
  p_token_hash text,
  p_public_id text,
  p_title text,
  p_description text,
  p_destination_network text,
  p_destination_asset_id text,
  p_destination_asset_symbol text,
  p_destination_decimals integer,
  p_amount_mode text,
  p_requested_atomic_amount numeric,
  p_expires_at timestamptz,
  p_metadata jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
DECLARE
  v_key flow.mcp_agent_keys%ROWTYPE;
  v_row jsonb;
BEGIN
  SELECT * INTO v_key
  FROM flow.mcp_agent_keys
  WHERE token_hash = p_token_hash
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'MCP_INVALID_TOKEN');
  END IF;

  IF v_key.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'MCP_KEY_NOT_ACTIVE');
  END IF;

  IF v_key.expires_at IS NOT NULL AND v_key.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'MCP_KEY_EXPIRED');
  END IF;

  IF NOT v_key.can_create_payment_links THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'MCP_PAYMENT_LINKS_NOT_ALLOWED');
  END IF;

  INSERT INTO flow.payment_requests (
    account_id,
    public_id,
    title,
    description,
    destination_network,
    destination_asset_id,
    destination_asset_symbol,
    destination_decimals,
    amount_mode,
    requested_atomic_amount,
    status,
    expires_at,
    payer_memo_required,
    metadata
  )
  VALUES (
    v_key.account_id,
    p_public_id,
    p_title,
    p_description,
    p_destination_network,
    p_destination_asset_id,
    p_destination_asset_symbol,
    p_destination_decimals,
    p_amount_mode::flow.payment_amount_mode,
    p_requested_atomic_amount,
    'ACTIVE'::flow.payment_request_status,
    p_expires_at,
    false,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'createdViaMcp', true,
      'mcpAgentKeyId', v_key.id,
      'mcpAgentName', v_key.name
    )
  )
  RETURNING jsonb_build_object(
    'id', id,
    'publicId', public_id,
    'title', title,
    'description', description,
    'destinationNetwork', destination_network,
    'destinationAssetId', destination_asset_id,
    'destinationAssetSymbol', destination_asset_symbol,
    'destinationDecimals', destination_decimals,
    'amountMode', amount_mode::text,
    'requestedAtomicAmount', requested_atomic_amount::text,
    'status', status::text,
    'expiresAt', expires_at,
    'createdAt', created_at
  )
  INTO v_row;

  RETURN jsonb_build_object('ok', true, 'paymentRequest', v_row);
END;
$$;

REVOKE ALL ON FUNCTION flow.mcp_authenticate_key(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.mcp_get_account_snapshot(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.mcp_get_reserved_atomic(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.mcp_find_transfer_by_idempotency(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.mcp_get_transfer(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.mcp_list_activity(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.mcp_enqueue_transfer(text, text, uuid, uuid, text, text, text, text, integer, numeric, text, text, text, text, text, text, integer, numeric, text, text, text, jsonb, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.mcp_create_payment_link(text, text, text, text, text, text, text, integer, text, numeric, timestamptz, jsonb) FROM PUBLIC;

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
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE flow.mcp_agent_keys TO %I', app_role);
    EXECUTE format('GRANT SELECT, INSERT, DELETE ON TABLE flow.mcp_agent_spend_events TO %I', app_role);

    EXECUTE 'DROP POLICY IF EXISTS mcp_agent_keys_tenant_policy ON flow.mcp_agent_keys';
    EXECUTE format(
      'CREATE POLICY mcp_agent_keys_tenant_policy ON flow.mcp_agent_keys FOR ALL TO %I USING (flow.can_access_account(account_id)) WITH CHECK (flow.can_access_account(account_id))',
      app_role
    );

    EXECUTE 'DROP POLICY IF EXISTS mcp_agent_spend_events_tenant_policy ON flow.mcp_agent_spend_events';
    EXECUTE format(
      'CREATE POLICY mcp_agent_spend_events_tenant_policy ON flow.mcp_agent_spend_events FOR ALL TO %I USING (flow.can_access_account(account_id)) WITH CHECK (flow.can_access_account(account_id))',
      app_role
    );

    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.mcp_authenticate_key(text) TO %I', app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.mcp_get_account_snapshot(text) TO %I', app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.mcp_get_reserved_atomic(text, text, text) TO %I', app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.mcp_find_transfer_by_idempotency(text, uuid) TO %I', app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.mcp_get_transfer(text, text) TO %I', app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.mcp_list_activity(text, integer) TO %I', app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.mcp_enqueue_transfer(text, text, uuid, uuid, text, text, text, text, integer, numeric, text, text, text, text, text, text, integer, numeric, text, text, text, jsonb, bigint) TO %I', app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.mcp_create_payment_link(text, text, text, text, text, text, text, integer, text, numeric, timestamptz, jsonb) TO %I', app_role);
  END IF;

  -- Ensure FORCE ROW LEVEL SECURITY never hides rows from SECURITY DEFINER MCP helpers
  FOREACH r IN ARRAY ARRAY[migrator_role, definer_role] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      FOREACH sel_tbl IN ARRAY ARRAY[
        'accounts',
        'wallets',
        'wallet_addresses',
        'wallet_balances',
        'network_assets',
        'assets',
        'wallet_activities'
      ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON flow.%I', 'mcp_definer_read_' || r, sel_tbl);
        EXECUTE format('CREATE POLICY %I ON flow.%I FOR SELECT TO %I USING (true)', 'mcp_definer_read_' || r, sel_tbl, r);
      END LOOP;

      FOREACH all_tbl IN ARRAY ARRAY[
        'mcp_agent_keys',
        'mcp_agent_spend_events',
        'outgoing_transfer_jobs',
        'payment_requests'
      ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON flow.%I', 'mcp_definer_all_' || r, all_tbl);
        EXECUTE format('CREATE POLICY %I ON flow.%I FOR ALL TO %I USING (true) WITH CHECK (true)', 'mcp_definer_all_' || r, all_tbl, r);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
